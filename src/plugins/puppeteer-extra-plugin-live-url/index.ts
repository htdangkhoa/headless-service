import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import type { Page, CDPSession, Target, Browser } from 'puppeteer';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'node:http';

import { COMMANDS, DOMAINS, EVENTS, LIVE_COMMANDS, SPECIAL_COMMANDS } from '@/constants';
import {
  buildProtocolEventNames,
  buildProtocolMethod,
  getBrowserId,
  makeExternalUrl,
  parseUrlFromIncomingMessage,
} from '@/utils';
import { Logger } from '@/logger';
import { DispatchResponse, Request, Response } from '@/cdp/devtools';

export class PuppeteerExtraPluginLiveUrl extends PuppeteerExtraPlugin {
  private readonly logger = new Logger(this.constructor.name);

  private browser: Browser | null = null;

  private pageMap: Map<
    string,
    {
      page: Page;
      cdp: CDPSession;
      protocolInfo: {
        id: number;
        sessionId?: string;
      };
    }
  > = new Map();

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

    const browserId = getBrowserId(browser);

    const { eventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.LIVE_URL
    );

    browser.on(eventNameForListener, this.onHeadlessServiceLiveURL.bind(this));
  }

  async onDisconnected(): Promise<void> {
    this.browser = null;
    Array.from(this.pageMap.values()).forEach(({ cdp }) => {
      cdp.removeAllListeners();
    });

    this.pageMap.clear();
  }

  onTargetDestroyed(target: Target): Promise<void> {
    // @ts-ignore
    const targetId = target._targetId;

    return Promise.resolve(this.handleTargetDestroyed.call(this, targetId));
  }

  private async messageHandler(rawMessage: RawData, socket: WebSocket, req: IncomingMessage) {
    const { searchParams } = parseUrlFromIncomingMessage(req);

    const targetId = searchParams.get('t');

    if (!targetId) return;

    const pageMapped = this.pageMap.get(targetId);

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

          this.handleTargetDestroyed(targetId, 'Screencast stopped');

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

      this.pageMap.set(targetId, {
        page: currentPage,
        cdp: client,
        protocolInfo: {
          id: payload.id,
          sessionId: payload.sessionId,
        },
      });

      const liveUrl = new URL(makeExternalUrl('http', `/live`));
      liveUrl.searchParams.set('t', targetId);
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

  private handleTargetDestroyed(targetId: string, reason?: string) {
    if (!this.browser) return;

    const pageMapped = this.pageMap.get(targetId);

    if (!pageMapped) return;

    const { protocolInfo } = pageMapped;

    const browserId = getBrowserId(this.browser);

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
