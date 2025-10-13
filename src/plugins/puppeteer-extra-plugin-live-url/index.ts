import type { IncomingMessage } from 'node:http';
import dayjs from 'dayjs';
import { Protocol } from 'devtools-protocol';
import jwt from 'jsonwebtoken';
import { get } from 'lodash-es';
import {
  TargetType,
  type Browser,
  type CDPSession,
  type Page,
  type Target,
  type Viewport,
} from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

import { DispatchResponse, Request, Response } from '@/cdp/devtools';
import { COMMANDS, DOMAINS, EVENTS, LIVE_SERVER } from '@/constants';
import { Logger } from '@/logger';
import { Dictionary } from '@/types';
import type { LiveContext, LiveMessage } from '@/types/live';
import {
  buildProtocolEventNames,
  buildProtocolMethod,
  env,
  getBrowserId,
  makeExternalUrl,
} from '@/utils';

import { ClientManagement } from './client-management';

interface PageData {
  page: Page;
  cdp: CDPSession;
  targetId: string;
}

enum STATE {
  IDLE = 'idle',
  RUNNING = 'running',
}

interface Webhook {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
}

export class PuppeteerExtraPluginLiveUrl extends PuppeteerExtraPlugin {
  private readonly logger = new Logger(this.constructor.name);

  private browser: Browser | null = null;

  private pages: Map<string, PageData> = new Map();

  private commandSessionIds: Set<string> = new Set();

  private readonly PROTOCOL_METHODS = {
    LIVE_URL: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.LIVE_URL),
    LIVE_COMPLETE: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, EVENTS.LIVE_COMPLETE),
  };

  private clientManagement: ClientManagement = new ClientManagement();

  private jwtOptions: Dictionary;

  private expiresAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;

  private state: STATE = STATE.IDLE;

  private webhook: Webhook | null = null;

  constructor(
    private ws: WebSocketServer,
    private readonly requestId?: string
  ) {
    super();

    const liveUrl = new URL(makeExternalUrl('http', 'live'));
    this.jwtOptions = {
      audience: [liveUrl.href],
      issuer: liveUrl.hostname,
    };

    this.ws.on(this.constructor.name, async (socket: WebSocket, req) => {
      this.logger.info('connected from plugins', this.requestId);

      socket.on('message', (rawMessage) => this.messageHandler.call(this, rawMessage, socket, req));

      socket.on('close', () => this.onSocketClose.call(this, socket));

      socket.on('error', (error) => this.onSocketError.call(this, socket, error));
    });
  }

  get name(): string {
    return 'live-url';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    this.browser = browser;

    const cdp = await browser.target().createCDPSession();
    cdp.send('Target.setDiscoverTargets', { discover: true });
    cdp.on('Target.targetInfoChanged', this.onTargetInfoChanged.bind(this));

    const browserId = getBrowserId(browser);

    const { eventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.LIVE_URL
    );

    browser.on(eventNameForListener, this.onHeadlessServiceLiveURL.bind(this));
  }

  async onDisconnected(): Promise<void> {
    this.browser = null;

    Array.from(this.pages.values()).forEach(({ cdp, page }) => {
      cdp.removeAllListeners();
      page.removeAllListeners();
    });

    this.pages.clear();
  }

  async onTargetCreated(target: Target): Promise<void> {
    const targetId = target._targetId;

    if (target.type() === TargetType.PAGE) {
      const page = await target.asPage();

      const cdp = await page.createCDPSession();
      await cdp.send(LIVE_SERVER.CDP_COMMANDS.ENABLE);
      await cdp.send(LIVE_SERVER.CDP_COMMANDS.SET_LIFECYCLE_EVENTS_ENABLED, { enabled: true });
      cdp.on(LIVE_SERVER.CDP_EVENTS.LIFECYCLE_EVENT, (event) =>
        this.onPageLifecycleEvent.call(this, event, page)
      );

      this.pages.set(targetId, {
        page,
        cdp,
        targetId: targetId,
      });

      const isActive = await page.evaluate(() => document.visibilityState === 'visible');

      if (isActive) {
        try {
          await this.startScreencast(targetId);
        } catch {}

        await this.startScreencast(targetId);
      }

      const clients = this.clientManagement.getClients();
      clients.forEach((socket) => {
        const context: LiveContext = {
          connectionId: socket.id!,
        };
        socket.send(
          JSON.stringify({
            command: LIVE_SERVER.COMMANDS.TARGET_CREATED,
            data: {
              targetId,
              active: isActive,
            },
            context,
          })
        );
      });
    }

    return Promise.resolve();
  }

  async onTargetDestroyed(target: Target): Promise<void> {
    const browser = target.browser();
    const browserId = getBrowserId(browser);

    const targetId = target._targetId;

    const pageData = this.pages.get(targetId);
    if (!pageData) return;

    const { cdp } = pageData;

    cdp.removeAllListeners();

    this.pages.delete(targetId);

    const currentPage = await this.browser!.currentPage();
    const currentTargetId = currentPage.target()._targetId;

    const clients = this.clientManagement.getClients();
    clients.forEach((socket) => {
      const context: LiveContext = {
        connectionId: socket.id!,
      };
      socket.send(
        JSON.stringify({
          command: LIVE_SERVER.COMMANDS.TARGET_DESTROYED,
          data: {
            targetId,
            activeTargetId: currentTargetId,
          },
          context,
        })
      );
    });

    await this.startScreencast(currentTargetId);

    return Promise.resolve();
  }

  private async onTargetInfoChanged(event: Protocol.Target.TargetInfoChangedEvent) {
    if (!this.browser) return;

    if (event.targetInfo.type === 'page') {
      const pages = await this.browser.pages();
      const page = pages.find((page) => page.target()._targetId === event.targetInfo.targetId);
      if (!page) return;

      await this.updateTabInfo(page);
    }
  }

  private async onPageLifecycleEvent(event: Protocol.Page.LifecycleEventEvent, page: Page) {
    switch (event.name) {
      case 'init': {
        await this.sendTargetStateChanged(page, 'loading:start');
        break;
      }
      case 'networkIdle': {
        await this.sendTargetStateChanged(page, 'loading:end');
        break;
      }
    }
  }

  private async sendTargetStateChanged(page: Page, state: string) {
    const targetId = page.target()._targetId;

    let tabInfo = null;

    try {
      tabInfo = await this.getTabInfo(page);
    } catch {}

    const clients = this.clientManagement.getClients();
    clients.forEach((socket) => {
      const context: LiveContext = {
        connectionId: socket.id!,
      };

      socket.send(
        JSON.stringify({
          command: LIVE_SERVER.COMMANDS.TARGET_STATE_CHANGED,
          data: {
            ...tabInfo,
            targetId,
            state,
          },
          context,
        })
      );
    });
  }

  private async messageHandler(rawMessage: RawData, socket: WebSocket, req: IncomingMessage) {
    if (this.state === STATE.IDLE) return;

    if (!this.browser) return;

    const browserId = getBrowserId(this.browser);

    const buffer = Buffer.from(rawMessage as Buffer);
    const message = Buffer.from(buffer).toString('utf8');
    const rawPayload = JSON.parse(message) as LiveMessage;
    const { context, ...payload } = rawPayload;

    if (!context.session) return;

    const jwtPayload = this.verifySession(context.session);

    try {
      if (!jwtPayload) {
        return this.endLiveSession({ reason: 'Invalid session', force: true });
      }

      if (jwtPayload?.browserId !== browserId) return;

      switch (payload.command) {
        case LIVE_SERVER.EVENTS.REGISTER_SCREENCAST: {
          // TODO: error handling
          if (!payload.params?.connectionId) return;

          const existingClient = this.clientManagement.getClient(payload.params.connectionId);
          if (existingClient) {
            this.clientManagement.removeClient(existingClient);
            existingClient.close();
          }

          socket.id = payload.params.connectionId;
          this.clientManagement.addClient(socket);

          try {
            await this.stopScreencast();
          } catch {}

          const currentPage = await this.browser.currentPage();
          const currentTargetId = currentPage.target()._targetId;

          const pagesEntries = Object.fromEntries(this.pages);

          const tabs = await Promise.all(
            Object.values(pagesEntries).map(async ({ page, targetId: pageTargetId }) => {
              const tabInfo = await this.getTabInfo(page);
              return {
                ...tabInfo,
                targetId: pageTargetId,
                active: pageTargetId === currentTargetId,
              };
            })
          );

          await this.startScreencast(currentTargetId);

          this.clientManagement.send(
            payload.params.connectionId,
            JSON.stringify({
              command: LIVE_SERVER.COMMANDS.SCREENCAST_REGISTERED,
              data: tabs,
              context,
            })
          );

          break;
        }
        case LIVE_SERVER.EVENTS.RENEW_SESSION: {
          const {
            session: newSession,
            expiresAt,
            duration,
          } = this.generateSession(jwtPayload.browserId);

          if (this.timer) {
            clearTimeout(this.timer);
          }
          this.expiresAt = expiresAt;
          this.timer = setTimeout(() => {
            this.logger.warn('Session expired, ending live session');
            this.endLiveSession({ reason: 'Session expired' });
          }, duration);

          this.logger.info(`Session renewed, expires at: ${new Date(expiresAt).toISOString()}`);

          socket.send(
            JSON.stringify({
              command: LIVE_SERVER.COMMANDS.RENEW_SESSION_ACK,
              data: { session: newSession },
              context,
            })
          );

          break;
        }
        case LIVE_SERVER.EVENTS.GO_TO_TAB: {
          const { targetId } = payload.params || {};
          const foundPage = this.pages.get(targetId);

          if (!foundPage) return;

          const { page: targetPage } = foundPage;

          try {
            await this.stopScreencast();
          } catch {}

          // Bring target page to front
          await targetPage.bringToFront();

          const clients = this.clientManagement.getClients();
          clients.forEach((socket) => {
            socket.send(
              JSON.stringify({
                command: LIVE_SERVER.COMMANDS.TARGET_BRING_TO_FRONT,
                data: { targetId },
                context,
              })
            );
          });

          await this.updateTabInfo(targetPage);

          this.logger.info(`Switching to tab ${targetId}`);

          await this.startScreencast(targetId);

          break;
        }
        case LIVE_SERVER.EVENTS.CLOSE_TAB: {
          const { targetId } = payload.params || {};
          const foundPage = this.pages.get(targetId);

          if (!foundPage) return;

          try {
            await this.stopScreencast();
          } catch {}

          // Close the page
          await foundPage.page.close();

          break;
        }
        case LIVE_SERVER.EVENTS.GO_BACK: {
          const { targetId } = payload.params || {};
          const pageData = this.pages.get(targetId);
          if (!pageData) return;
          const { page } = pageData;
          await page.goBack();

          break;
        }
        case LIVE_SERVER.EVENTS.GO_FORWARD: {
          const { targetId } = payload.params || {};
          const pageData = this.pages.get(targetId);
          if (!pageData) return;
          const { page } = pageData;
          await page.goForward();

          break;
        }
        case LIVE_SERVER.EVENTS.RELOAD: {
          const { targetId } = payload.params || {};
          const pageData = this.pages.get(targetId);
          if (!pageData) return;
          const { page } = pageData;
          await page.reload();

          break;
        }
        case LIVE_SERVER.EVENTS.STOP_SCREENCAST: {
          await this.endLiveSession({ reason: 'Stop screencast', force: true });

          break;
        }
        case LIVE_SERVER.EVENTS.SET_VIEWPORT: {
          const { targetId, ...params } = payload.params || {};
          const pageData = this.pages.get(targetId);
          if (!pageData) return;
          const { page } = pageData;
          await page.setViewport(params as Viewport);

          break;
        }
        case LIVE_SERVER.EVENTS.INPUT_DISPATCH_KEY_EVENT: {
          const { targetId, ...params } = payload.params || {};
          const pageData = this.pages.get(targetId);
          if (!pageData) return;
          const { page, cdp } = pageData;

          if (['Delete', 'Backspace'].includes(params.code) && params.type === 'keyDown') {
            this.logger.info('Backspace detected');

            await page.keyboard.press('Backspace');
          } else {
            await cdp.send(payload.command, params as Protocol.Input.DispatchKeyEventRequest);
          }

          break;
        }
        case LIVE_SERVER.EVENTS.SCREENCAST_FRAME_ACK: {
          const { targetId, ...params } = payload.params || {};
          const pageData = this.pages.get(targetId);
          if (!pageData) return;
          const { cdp } = pageData;
          // Forward the ACK to the CDP session to acknowledge frame receipt
          try {
            await cdp.send(payload.command, params as Protocol.Page.ScreencastFrameAckRequest);
            // this.logger.debug('Screencast frame acknowledged');
          } catch (error) {
            this.logger.warn('Failed to send screencast frame ACK:', error);
          }
          break;
        }
        default: {
          const { targetId, ...params } = payload.params || {};
          const pageData = this.pages.get(targetId);
          if (!pageData) return;
          const { cdp } = pageData;
          await cdp.send(payload.command as any, params as any);

          break;
        }
      }
    } catch (error) {
      this.logger.error('Error sending command', error);
      // this.logger.debug('Payload params', payload.params);
    }
  }

  private async onSocketClose(socket: WebSocket) {
    this.logger.info('WebSocket client disconnected', socket.id);
    this.clientManagement.removeClient(socket);
  }

  private async onSocketError(socket: WebSocket, error: Error) {
    this.logger.error('WebSocket client error', error);
    this.clientManagement.removeClient(socket);
  }

  private async onHeadlessServiceLiveURL(payload: any) {
    const request = Request.parse(payload);

    if (!this.browser) return;

    if (request.method !== this.PROTOCOL_METHODS.LIVE_URL) return;

    const browserId = getBrowserId(this.browser);

    const webhook = get(payload, 'params.webhook') as Webhook | null;
    if (webhook) {
      this.webhook = webhook;
    }

    let response: any = null;

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.LIVE_URL
    );

    try {
      this.commandSessionIds.add(payload.sessionId);

      const liveUrl = new URL(makeExternalUrl('http', `live`));

      const { session, expiresAt, duration } = this.generateSession(browserId);
      liveUrl.searchParams.set('session', session);
      if (this.requestId) {
        liveUrl.searchParams.set('request_id', this.requestId);
      }

      this.expiresAt = expiresAt;
      this.timer = setTimeout(() => {
        this.endLiveSession({ reason: 'Session expired' });
      }, duration);

      this.state = STATE.RUNNING;

      response = Response.success(
        request.id!,
        {
          liveUrl: liveUrl.href,
        },
        payload.sessionId
      );
    } catch (error: any) {
      const dispatchResponse = DispatchResponse.InternalError(error.message);

      response = Response.error(request.id!, dispatchResponse, payload.sessionId);
    } finally {
      return this.browser.emit(eventNameForResult, response);
    }
  }

  private async updateTabInfo(page: Page) {
    const targetId = page.target()._targetId;

    const tabInfo = await this.getTabInfo(page);

    const clients = this.clientManagement.getClients();
    clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        const context: LiveContext = {
          connectionId: socket.id!,
        };
        socket.send(
          JSON.stringify({
            command: LIVE_SERVER.COMMANDS.FRAME_NAVIGATED,
            data: {
              ...tabInfo,
              targetId,
            },
            context,
          })
        );
      } else {
        this.logger.warn(
          `WebSocket not ready for frame navigation event, client ${socket.id}, state: ${socket.readyState}`
        );
        this.clientManagement.removeClient(socket);
      }
    });
  }

  private async getTabInfo(page: Page) {
    const title = await page.title();
    const url = page.url();
    const favicon = await page.evaluate(() => {
      const icon =
        document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
        document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']") ||
        document.querySelector<HTMLLinkElement>("link[rel*='apple-touch-icon']");
      return icon ? icon.href : null;
    });

    return {
      title,
      url,
      favicon,
    };
  }

  private async stopScreencast(targetId?: string) {
    if (!this.browser) return;

    if (targetId) {
      const pageData = this.pages.get(targetId);
      if (!pageData) return;
      const { cdp } = pageData;
      await cdp.send(LIVE_SERVER.CDP_COMMANDS.STOP_SCREENCAST);
      cdp.removeAllListeners(LIVE_SERVER.CDP_EVENTS.SCREENCAST_FRAME);
      this.logger.info(`Stopped screencast for target ${targetId}`);
      return;
    }

    const pagesData = Array.from(this.pages.values());
    for (const pageData of pagesData) {
      const { targetId } = pageData;
      await this.stopScreencast(targetId);
    }
  }

  private async startScreencast(targetId: string) {
    const pageData = this.pages.get(targetId);
    if (!pageData) return;
    const { page, cdp } = pageData;

    const browser = page.browser();
    const browserId = getBrowserId(browser);

    await cdp.send(LIVE_SERVER.CDP_COMMANDS.START_SCREENCAST, {
      format: 'jpeg',
      quality: 100,
      everyNthFrame: 1,
    });
    cdp.on(LIVE_SERVER.CDP_EVENTS.SCREENCAST_FRAME, async (data) => {
      this.logger.info(
        `Received screencast frame for target ${targetId}, data size: ${data.data?.length || 0}`
      );

      const clients = this.clientManagement.getClients();
      this.logger.info(`Broadcasting to ${clients.length} clients`);

      clients.forEach((clientSocket) => {
        const clientContext: LiveContext = {
          connectionId: clientSocket.id!,
        };
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(
            JSON.stringify({
              command: LIVE_SERVER.COMMANDS.SCREENCAST_FRAME,
              data: {
                ...data,
                targetId,
              },
              context: clientContext,
            })
          );
          this.logger.info(`Sent screencast frame to client ${clientSocket.id}`);
        } else {
          this.logger.warn(
            `WebSocket not ready for client ${clientSocket.id}, state: ${clientSocket.readyState}`
          );
          this.clientManagement.removeClient(clientSocket);
        }
      });
    });
  }

  private async endLiveSession(options?: { reason?: string; force?: boolean }) {
    const { reason, force } = options || {};

    if (!this.browser) return;

    const browserId = getBrowserId(this.browser);

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const now = dayjs();
    const expiresAt = dayjs(this.expiresAt);
    if (!expiresAt.isBefore(now) && !force) {
      const diff = expiresAt.diff(now);
      this.logger.info(`Session not expired yet, rescheduling end in ${diff}ms`);
      this.timer = setTimeout(() => {
        this.endLiveSession({ reason: 'Session expired' });
      }, diff);
      return;
    }

    try {
      await this.stopScreencast();
    } catch {}

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.LIVE_URL
    );

    const self = this;
    this.commandSessionIds.forEach((sessionId) => {
      const payload = {
        sessionId,
        method: this.PROTOCOL_METHODS.LIVE_COMPLETE,
        params: { reason: reason ?? `Target ${browserId} destroyed` },
      };
      self.browser!.emit(eventNameForResult, payload);
    });

    this.commandSessionIds.clear();
    this.clientManagement.clear();
    this.state = STATE.IDLE;

    if (this.webhook) {
      const { url, method, headers } = this.webhook;
      try {
        await fetch(url, {
          method: method ?? 'GET',
          headers,
        });
      } catch (error) {
        this.logger.warn('Error calling webhook', error);
      }
    }
  }

  private generateSession(browserId: string, expiresIn: number = 420) {
    const session = jwt.sign({ browserId }, env('HEADLESS_SERVICE_TOKEN')!, {
      ...this.jwtOptions,
      expiresIn,
    });

    const payload = jwt.decode(session) as jwt.JwtPayload;
    const now = dayjs();
    const expiresAt = dayjs.unix(payload.exp!).valueOf();
    const duration = dayjs(expiresAt).diff(now);

    this.logger.info(`Generated session: expires in ${expiresIn}s, actual duration: ${duration}ms`);

    return {
      session,
      expiresAt,
      duration,
    };
  }

  private verifySession(session: string): jwt.JwtPayload | null {
    try {
      return jwt.verify(session, env('HEADLESS_SERVICE_TOKEN')!, this.jwtOptions) as jwt.JwtPayload;
    } catch (error) {
      return null;
    }
  }
}

const LiveUrlPlugin = (ws: WebSocketServer, requestId?: string) =>
  new PuppeteerExtraPluginLiveUrl(ws, requestId);

export default LiveUrlPlugin;
