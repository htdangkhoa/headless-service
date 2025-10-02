import type { IncomingMessage } from 'node:http';
import {
  TargetType,
  type Browser,
  type CDPSession,
  type ConsoleMessage,
  type Page,
  type Target,
} from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

import { DispatchResponse, Request, Response } from '@/cdp/devtools';
import { COMMANDS, DOMAINS, EVENTS, LIVE_COMMANDS, SPECIAL_COMMANDS } from '@/constants';
import { Logger } from '@/logger';
import {
  buildProtocolEventNames,
  buildProtocolMethod,
  getBrowserId,
  makeExternalUrl,
  parseUrlFromIncomingMessage,
} from '@/utils';

interface PageMappedData {
  page: Page;
  cdp: CDPSession;
  protocolInfo: {
    id: number;
    sessionId?: string;
  };
  targetId: string;
}

export class PuppeteerExtraPluginLiveUrl extends PuppeteerExtraPlugin {
  private readonly logger = new Logger(this.constructor.name);

  private browser: Browser | null = null;

  private consoleListeners: Map<string, (message: ConsoleMessage) => void> = new Map();

  private pageMap: Map<string, PageMappedData> = new Map();

  private readonly PROTOCOL_METHODS = {
    LIVE_URL: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.LIVE_URL),
    LIVE_COMPLETE: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, EVENTS.LIVE_COMPLETE),
  };

  constructor(
    private ws: WebSocketServer,
    private readonly requestId?: string
  ) {
    super();

    this.ws.on(this.constructor.name, async (socket: WebSocket, req) => {
      this.logger.info('connected from plugins', this.requestId);

      socket.on('message', (rawMessage) => this.messageHandler.call(this, rawMessage, socket, req));
    });
  }

  get name(): string {
    return 'live-url';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    this.browser = browser;

    const cdp = await browser.target().createCDPSession();
    await cdp.send('Target.setDiscoverTargets', { discover: true });

    // cdp.on('Target.targetInfoChanged', (event) => {
    //   if (event.targetInfo.type === 'page') {
    //     console.log('Tab changed:', event.targetInfo);
    //   }
    // });

    const browserId = getBrowserId(browser);

    const { eventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.LIVE_URL
    );

    browser.on(eventNameForListener, this.onHeadlessServiceLiveURL.bind(this));

    const targets = browser.targets();
    const extTarget = targets.find((t) => {
      return t.type() === 'background_page' && t.url().startsWith('chrome-extension://');
    });
    console.log('🚀 ~ PuppeteerExtraPluginLiveUrl ~ onBrowser ~ extTarget:', extTarget);
  }

  async onDisconnected(): Promise<void> {
    this.browser = null;

    const pageMapValues = Array.from(this.pageMap.values());

    for (const { page, cdp } of pageMapValues) {
      const { targetInfo } = await cdp.send('Target.getTargetInfo');

      const consoleListener = this.consoleListeners.get(targetInfo.targetId);
      if (consoleListener) {
        page.off('console', consoleListener);
      }

      cdp.removeAllListeners();
    }

    this.consoleListeners.clear();
    this.pageMap.clear();
  }

  async onTargetCreated(target: Target): Promise<void> {
    console.log('onTargetCreated', target.type(), target.url());

    // extension
    if (target.type() === TargetType.SERVICE_WORKER) {
      const cdp = await target.createCDPSession();

      await cdp.send('Runtime.enable');

      cdp.on('Runtime.consoleAPICalled', async (event) => {
        const args = await Promise.all(
          (event.args || []).map(async (arg) => {
            try {
              const res = await cdp
                .send('Runtime.getProperties', { objectId: arg.objectId! })
                .catch(() => null);
              return arg.value ?? (res ? JSON.stringify(res) : '<complex>');
            } catch (e) {
              return '<cannot-serialize>';
            }
          })
        );
        console.log('[EXT-SW-CONSOLE]', event.type, args);
      });

      // uncaught exceptions in worker
      cdp.on('Runtime.exceptionThrown', (ex) => {
        console.error('[EXT-SW-EX]', ex.exceptionDetails?.text || ex);
      });
    }

    // if (target.type() === TargetType.PAGE) {
    //   const cdp = await target.createCDPSession();

    //   const { targetInfo } = await cdp.send('Target.getTargetInfo');

    //   const page = await target.asPage();

    //   const consoleListener = (message: ConsoleMessage) => {
    //     console.log('Console log:', `${message.type()}: ${message.text()}`);
    //   };

    //   this.consoleListeners.set(targetInfo.targetId, consoleListener);

    //   page.on('console', consoleListener);

    //   return Promise.resolve();
    // }

    return Promise.resolve();
  }

  async onTargetChanged(target: Target): Promise<void> {
    // console.log('onTargetChanged', target.type(), target.url());

    if (target.type() === TargetType.PAGE) {
      const cdp = await target.createCDPSession();

      const { targetInfo } = await cdp.send('Target.getTargetInfo');

      const page = await target.asPage();

      console.log('url:', target.url());

      await page.evaluateOnNewDocument((pageId: string) => {
        console.log('🚀 ~ PuppeteerExtraPluginLiveUrl ~ onTargetChanged ~ pageId:', pageId);
        window.addEventListener('load', () => {
          let pageIdEle = document.getElementById('page-id');
          if (!pageIdEle) {
            pageIdEle = document.createElement('meta');
            pageIdEle.id = 'page-id';
            pageIdEle.setAttribute('property', 'page-id');
            document.head.appendChild(pageIdEle);
          }

          pageIdEle.setAttribute('content', pageId);
        });
      }, targetInfo.targetId);

      return Promise.resolve();
    }

    return Promise.resolve();
  }

  async onTargetDestroyed(target: Target): Promise<void> {
    // // @ts-ignore
    // const targetId = target._targetId;

    const cdp = await target.createCDPSession();

    const { targetInfo } = await cdp.send('Target.getTargetInfo');

    const consoleListener = this.consoleListeners.get(targetInfo.targetId);
    if (consoleListener) {
      this.consoleListeners.delete(targetInfo.targetId);
    }

    if (target.type() === TargetType.PAGE) {
      const page = await target.asPage();
      page.off('console', consoleListener);
      const browser = page.browser();
      const browserId = getBrowserId(browser);
      return Promise.resolve(this.handleTargetDestroyed.call(this, browserId));
    }

    return Promise.resolve();
  }

  private async messageHandler(rawMessage: RawData, socket: WebSocket, req: IncomingMessage) {
    const { searchParams } = parseUrlFromIncomingMessage(req);

    const browserId = searchParams.get('session');

    if (!browserId) return;

    const pageMapped = this.pageMap.get(browserId);

    if (!pageMapped) return;

    const { page, cdp: client } = pageMapped;

    const buffer = Buffer.from(rawMessage as Buffer);
    const message = Buffer.from(buffer).toString('utf8');
    const payload = JSON.parse(message);

    try {
      switch (payload.command) {
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
        case SPECIAL_COMMANDS.GET_URL: {
          const sendUrl = () => {
            const url = page.url();

            socket.send(
              JSON.stringify({
                command: SPECIAL_COMMANDS.GET_URL,
                data: url,
              })
            );
          };

          sendUrl();

          page.on('framenavigated', sendUrl);

          break;
        }
        case LIVE_COMMANDS.START_SCREENCAST: {
          await client.send(payload.command, payload.params);

          client.on(LIVE_COMMANDS.SCREENCAST_FRAME, async (data) => {
            socket.send(
              JSON.stringify({
                command: LIVE_COMMANDS.SCREENCAST_FRAME,
                data,
              })
            );
          });

          break;
        }
        case LIVE_COMMANDS.STOP_SCREENCAST: {
          this.logger.info('Stopping screencast');

          await client.send(payload.command);

          this.handleTargetDestroyed(browserId, 'Screencast stopped');

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
      const currentPage = await this.browser.currentPage();

      const client = await currentPage.createCDPSession();

      const {
        targetInfo: { targetId },
      } = await client.send('Target.getTargetInfo');

      const browserId = getBrowserId(this.browser);

      this.pageMap.set(browserId, {
        page: currentPage,
        cdp: client,
        protocolInfo: {
          id: payload.id,
          sessionId: payload.sessionId,
        },
        targetId,
      });

      const liveUrl = new URL(makeExternalUrl('http', `/live`));
      liveUrl.searchParams.set('session', browserId);
      if (this.requestId) {
        liveUrl.searchParams.set('request_id', this.requestId);
      }

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

  private handleTargetDestroyed(browserId: string, reason?: string) {
    if (!this.browser) return;

    const pageMapped = this.pageMap.get(browserId);

    if (!pageMapped) return;

    const { protocolInfo, targetId } = pageMapped;

    const payload = {
      // id: protocolInfo.id,
      sessionId: protocolInfo.sessionId,
      method: this.PROTOCOL_METHODS.LIVE_COMPLETE,
      params: {
        reason: reason ?? `Target ${targetId} destroyed`,
      },
    };

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.LIVE_URL
    );

    this.browser.emit(eventNameForResult, payload);
  }
}

const LiveUrlPlugin = (ws: WebSocketServer, requestId?: string) =>
  new PuppeteerExtraPluginLiveUrl(ws, requestId);

export default LiveUrlPlugin;
