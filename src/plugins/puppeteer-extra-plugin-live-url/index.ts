import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { Page, CDPSession, Target, Frame } from 'puppeteer';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'node:http';

import {
  makeExternalUrl,
  parseUrlFromIncomingMessage,
  patchNamedFunctionESBuildIssue2605,
} from '@/utils';
import { LIVE_COMMANDS, SPECIAL_COMMANDS } from '@/constants';
import { Logger } from '@/logger';

declare global {
  interface Window {
    liveURL: () => string;

    liveComplete: () => void;
  }
}

export class PuppeteerExtraPluginLiveUrl extends PuppeteerExtraPlugin {
  private readonly logger = new Logger(this.constructor.name);

  private pageMap: Map<string, { page: Page; cdp: CDPSession }> = new Map();

  constructor(
    private ws: WebSocketServer,
    private requestId?: string
  ) {
    super();

    this.ws.once('connection', async (socket, req) => {
      this.logger.info('connected from plugins', this.requestId);

      socket.on('message', (rawMessage) => this.messageHandler.call(this, rawMessage, socket, req));
    });
  }

  get name(): string {
    return 'live-url';
  }

  async onClose(): Promise<void> {
    Array.from(this.pageMap.values()).forEach(({ cdp }) => {
      cdp.removeAllListeners();
    });

    this.pageMap.clear();
  }

  async onTargetDestroyed(target: Target): Promise<void> {
    const targetType = target.type();

    if (targetType !== 'page') return;

    // @ts-ignore
    const targetId = target._targetId;

    const pageMapped = this.pageMap.get(targetId);

    if (!pageMapped) return;

    const { cdp } = pageMapped;

    const page = await target.page();
    page?.off('framenavigated', this.onFrameNavigated.bind(this));

    cdp.removeAllListeners();

    this.pageMap.delete(targetId);
  }

  async onPageCreated(page: Page): Promise<void> {
    await patchNamedFunctionESBuildIssue2605(page);

    const self = this;

    page.on('framenavigated', self.onFrameNavigated.bind(self));

    page.on('framedetached', (frame: Frame) => {
      page.off('framenavigated', self.onFrameNavigated.bind(self));
    });

    await Promise.allSettled([page.waitForNavigation({ timeout: 0 }), this.injectLiveUrlAPI(page)]);
  }

  private async onFrameNavigated(frame: Frame) {
    if (frame.detached) return;

    if (frame.parentFrame()?.detached) return;

    const page = frame.page();

    if (page.isClosed()) return;

    await this.injectLiveUrlAPI(frame);
  }

  private async injectLiveUrlAPI(target: Page | Frame) {
    if (!(target instanceof Page) && !(target instanceof Frame))
      throw new Error('Target must be either a Page or a Frame');

    let page: Page;

    if (target instanceof Page) {
      page = target;
    } else {
      page = (<Frame>target).page();
    }

    const client = await page.createCDPSession();

    const {
      targetInfo: { targetId },
    } = await client.send('Target.getTargetInfo');

    this.pageMap.set(targetId, { page, cdp: client });

    const setupEmbeddedAPI = (_liveUrl: string) => {
      Object.defineProperty(window, 'liveURL', {
        configurable: false,
        enumerable: false,
        value: () => _liveUrl,
        writable: false,
      });
    };

    const liveUrl = new URL(makeExternalUrl('http', `/live`));
    liveUrl.searchParams.set('t', targetId);
    if (this.requestId) {
      liveUrl.searchParams.set('request_id', this.requestId);
    }

    const promises: any[] = [
      target.waitForNavigation({ timeout: 0 }),
      target.evaluate(setupEmbeddedAPI, liveUrl.href),
    ];

    if (target instanceof Page) {
      promises.push(page.evaluateOnNewDocument(setupEmbeddedAPI, liveUrl.href));
    }

    await Promise.allSettled(promises);
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

          await page.evaluate(() => {
            window && typeof window.liveComplete === 'function' && window.liveComplete();
          });

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
}

const LiveUrlPlugin = (ws: WebSocketServer, requestId?: string) =>
  new PuppeteerExtraPluginLiveUrl(ws, requestId);

export default LiveUrlPlugin;
