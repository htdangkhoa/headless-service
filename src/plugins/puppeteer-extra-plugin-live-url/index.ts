import type { IncomingMessage } from 'node:http';
import dayjs from 'dayjs';
import {
  Frame,
  TargetType,
  type Browser,
  type CDPSession,
  type Page,
  type Target,
} from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import { DispatchResponse, Request, Response } from '@/cdp/devtools';
import {
  COMMANDS,
  CUSTOM_COMMANDS,
  DEFAULT_KEEP_ALIVE_TIMEOUT,
  DOMAINS,
  EVENTS,
  LIVE_COMMANDS,
  LIVE_EVENT_NAMES,
  SPECIAL_COMMANDS,
} from '@/constants';
import { Logger } from '@/logger';
import {
  buildProtocolEventNames,
  buildProtocolMethod,
  getBrowserId,
  makeExternalUrl,
} from '@/utils';

import { ClientManagement } from './client-management';

interface PageData {
  page: Page;
  cdp: CDPSession;
  targetId: string;
}

interface LiveContext {
  sessionId: string;
  connectionId: string;
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

  private expiresAt: Date | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private ws: WebSocketServer,
    private readonly requestId?: string
  ) {
    super();

    this.ws.on(this.constructor.name, async (socket: WebSocket, req) => {
      this.logger.info('connected from plugins', this.requestId);

      socket.on('message', (rawMessage) => this.messageHandler.call(this, rawMessage, socket, req));

      // socket.on('close', () => {
      //   this.clientManagement.removeClient(socket);
      // });
    });
  }

  get name(): string {
    return 'live-url';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    this.browser = browser;

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

      const browser = page.browser();

      const browserId = getBrowserId(browser);

      const cdp = await page.createCDPSession();

      this.pages.set(targetId, {
        page,
        cdp,
        targetId: targetId,
      });

      const self = this;
      const clients = this.clientManagement.getClients();
      clients.forEach((socket) => {
        const context = {
          sessionId: browserId,
          connectionId: socket.id,
        };
        self.renderTabs.call(self, socket, context);
        self.startScreencast.call(self, socket, context);
      });

      page.on('framenavigated', this.onFrameNavigated.bind(this));

      cdp.on(LIVE_COMMANDS.SCREENCAST_FRAME, async (data) => {
        const clients = this.clientManagement.getClients();
        clients.forEach((socket) => {
          const context = {
            sessionId: browserId,
            connectionId: socket.id,
          };
          socket.send(JSON.stringify({ command: LIVE_COMMANDS.SCREENCAST_FRAME, data, context }));
        });
      });
    }

    return Promise.resolve();
  }

  async onTargetDestroyed(target: Target): Promise<void> {
    const targetId = target._targetId;

    const pageData = this.pages.get(targetId);
    if (!pageData) return;

    this.pages.delete(targetId);

    return Promise.resolve(this.handleTargetDestroyed.call(this, target));
  }

  private async onFrameNavigated(frame: Frame) {
    if (!frame.parentFrame()) {
      const page = frame.page();
      const cdp = await page.createCDPSession();
      const { targetInfo } = await cdp.send('Target.getTargetInfo');

      const foundPage = this.pages.get(targetInfo.targetId);

      if (!foundPage) return;

      const { page: targetPage } = foundPage;

      const url = targetPage.url();
      const title = await targetPage.title();

      const browser = page.browser();
      const browserId = getBrowserId(browser);

      const favicon = await page.evaluate(() => {
        const icon =
          document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
          document.querySelector<HTMLLinkElement>("link[rel='shortcut icon']") ||
          document.querySelector<HTMLLinkElement>("link[rel*='apple-touch-icon']");
        return icon ? icon.href : null;
      });

      const clients = this.clientManagement.getClients();
      clients.forEach((socket) => {
        const context = {
          sessionId: browserId,
          connectionId: socket.id,
        };

        socket.send(
          JSON.stringify({
            command: LIVE_EVENT_NAMES.FRAME_NAVIGATED,
            data: {
              targetId: targetInfo.targetId,
              url,
              title,
              favicon,
            },
            context,
          })
        );
      });
    }
  }

  private async renderTabs(socket: WebSocket, context: any) {
    if (!this.browser) return;

    const currentPage = await this.browser.currentPage();
    const currentPageCDP = await currentPage.createCDPSession();
    const { targetInfo } = await currentPageCDP.send('Target.getTargetInfo');

    const pagesEntries = Object.fromEntries(this.pages);

    // TODO: Add more properties to the tab object
    const tabs = Object.values(pagesEntries).map(({ page, targetId }) => ({
      targetId,
      active: targetId === targetInfo.targetId,
      url: page.url(),
    }));

    socket.send(
      JSON.stringify({
        command: CUSTOM_COMMANDS.RENDER_TABS,
        data: tabs,
        context,
      })
    );
  }

  private async messageHandler(rawMessage: RawData, socket: WebSocket, req: IncomingMessage) {
    if (!this.browser) return;

    const browserId = getBrowserId(this.browser);

    const activePage = await this.browser.currentPage();
    const activePageCDP = await activePage.createCDPSession();
    const { targetInfo } = await activePageCDP.send('Target.getTargetInfo');

    const foundPage = this.pages.get(targetInfo.targetId);

    if (!foundPage) return;

    const { page, cdp: client } = foundPage;

    const buffer = Buffer.from(rawMessage as Buffer);
    const message = Buffer.from(buffer).toString('utf8');
    const rawPayload = JSON.parse(message);
    const { context, ...payload } = rawPayload;

    if (context.sessionId !== browserId) return;

    try {
      switch (payload.command) {
        case CUSTOM_COMMANDS.REGISTER_SCREENCAST: {
          // TODO: error handling
          // if (!payload.params.id)
          const existingClient = this.clientManagement.getClient(payload.params.connectionId);
          if (existingClient) {
            this.clientManagement.removeClient(existingClient);
            existingClient.close();
          }

          socket.id = payload.params.connectionId;
          this.clientManagement.addClient(socket);

          this.renderTabs(socket, context);

          this.startScreencast(socket, context);

          break;
        }
        case CUSTOM_COMMANDS.GO_TO_TAB: {
          const foundPage = this.pages.get(payload.params.targetId);

          if (!foundPage) return;

          const { page: targetPage } = foundPage;

          await targetPage.bringToFront();

          this.renderTabs(socket, context);

          this.startScreencast(socket, context);

          break;
        }
        case CUSTOM_COMMANDS.CLOSE_TAB: {
          const foundPage = this.pages.get(payload.params.targetId);

          if (!foundPage) return;

          await foundPage.page.close();

          this.pages.delete(foundPage.targetId);

          this.renderTabs(socket, context);

          break;
        }
        case CUSTOM_COMMANDS.KEEP_ALIVE: {
          const timeout = payload.params.ms || DEFAULT_KEEP_ALIVE_TIMEOUT;
          this.expiresAt = dayjs().add(timeout).toDate();
          if (this.timer) {
            clearTimeout(this.timer);
          }
          this.timer = setTimeout(() => {
            this.stopScreencast();
          }, timeout);

          break;
        }
        case SPECIAL_COMMANDS.SET_VIEWPORT: {
          await page.setViewport(payload.params);

          break;
        }
        case SPECIAL_COMMANDS.GO_BACK: {
          await page.goBack();

          break;
        }
        case SPECIAL_COMMANDS.GO_FORWARD: {
          await page.goForward();

          break;
        }
        case SPECIAL_COMMANDS.RELOAD: {
          await page.reload();

          break;
        }
        case LIVE_COMMANDS.START_SCREENCAST: {
          const { targetId, ...params } = payload.params;

          const pageData = this.pages.get(targetId);

          if (!pageData) return;

          const { cdp } = pageData;

          await cdp.send(LIVE_COMMANDS.START_SCREENCAST, params);

          // cdp.on(LIVE_COMMANDS.SCREENCAST_FRAME, async (data) => {
          //   socket.send(
          //     JSON.stringify({
          //       command: LIVE_COMMANDS.SCREENCAST_FRAME,
          //       data,
          //       context,
          //     })
          //   );
          // });

          break;
        }
        case LIVE_COMMANDS.STOP_SCREENCAST: {
          this.logger.info('Stopping screencast');

          await client.send(payload.command);

          this.stopScreencast('Screencast stopped');

          break;
        }
        case LIVE_COMMANDS.INPUT_DISPATCH_KEY_EVENT: {
          if (
            ['Delete', 'Backspace'].includes(payload.params.code) &&
            payload.params.type === 'keyDown'
          ) {
            this.logger.info('Backspace detected');

            await page.keyboard.press('Backspace');
          } else {
            await client.send(payload.command, payload.params);
          }

          break;
        }
        default: {
          await client.send(payload.command, payload.params);

          break;
        }
      }
    } catch (error) {
      this.logger.error('Error sending command', error);
      this.logger.debug('Payload params', payload.params);
    }
  }

  private async onHeadlessServiceLiveURL(payload: any) {
    const request = Request.parse(payload);

    if (!this.browser) return;

    if (request.method !== this.PROTOCOL_METHODS.LIVE_URL) return;

    const browserId = getBrowserId(this.browser);

    let response: any = null;

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.LIVE_URL
    );

    try {
      this.commandSessionIds.add(payload.sessionId);

      const liveUrl = new URL(makeExternalUrl('http', `live`));
      liveUrl.searchParams.set('session', browserId);
      if (this.requestId) {
        liveUrl.searchParams.set('request_id', this.requestId);
      }

      this.expiresAt = dayjs().add(DEFAULT_KEEP_ALIVE_TIMEOUT).toDate();
      this.timer = setTimeout(() => {
        this.stopScreencast();
      }, DEFAULT_KEEP_ALIVE_TIMEOUT);

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

  private async handleTargetDestroyed(target: Target, reason?: string) {
    const targetId = target._targetId;

    const pageData = this.pages.get(targetId);
    if (!pageData) return;

    const { cdp } = pageData;

    cdp.removeAllListeners();

    this.pages.delete(targetId);
  }

  private async startScreencast(socket: WebSocket, context: any) {
    if (!this.browser) return;

    const pagesEntries = Object.fromEntries(this.pages);
    await Promise.allSettled(
      Object.values(pagesEntries).map(({ cdp }) => {
        return cdp.send(LIVE_COMMANDS.STOP_SCREENCAST);
      })
    );

    const activePage = await this.browser.currentPage();

    const cdp = await activePage.createCDPSession();
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    const targetId = targetInfo.targetId;

    // await cdp.send(LIVE_COMMANDS.START_SCREENCAST, {
    //   format: 'jpeg',
    //   quality: 100,
    //   everyNthFrame: 1,
    // });

    socket.emit(
      'message',
      JSON.stringify({
        command: LIVE_COMMANDS.START_SCREENCAST,
        params: {
          targetId,
          format: 'jpeg',
          quality: 100,
          everyNthFrame: 1,
        },
        context,
      })
    );
  }

  private async stopScreencast(reason?: string) {
    if (!this.browser) return;

    const browserId = getBrowserId(this.browser);

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const now = dayjs();
    const expiresAt = dayjs(this.expiresAt);
    if (!expiresAt.isBefore(now)) {
      const diff = expiresAt.diff(now);
      this.timer = setTimeout(() => {
        this.stopScreencast();
      }, diff);
      return;
    }

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

    this.clientManagement.clear();
    this.commandSessionIds.clear();
  }
}

const LiveUrlPlugin = (ws: WebSocketServer, requestId?: string) =>
  new PuppeteerExtraPluginLiveUrl(ws, requestId);

export default LiveUrlPlugin;
