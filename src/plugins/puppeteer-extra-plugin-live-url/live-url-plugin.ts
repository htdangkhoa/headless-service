import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { Page, CDPSession, Target } from 'puppeteer';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'node:http';

import { makeExternalUrl, parseUrlFromIncomingMessage } from '@/utils';
import { LIVE_COMMANDS, SPECIAL_COMMANDS } from '@/constants';

export class PuppeteerExtraPluginLiveUrl extends PuppeteerExtraPlugin {
  private pageMap: Map<string, { page: Page; cdp: CDPSession }> = new Map();

  constructor(private ws: WebSocketServer) {
    super();

    this.ws.once('connection', async (socket, req) => {
      console.log('connected from plugins');

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

    cdp.removeAllListeners();

    this.pageMap.delete(targetId);
  }

  async onPageCreated(page: Page): Promise<void> {
    const client = await page.createCDPSession();

    const { targetInfo } = await client.send('Target.getTargetInfo');

    this.pageMap.set(targetInfo.targetId, { page, cdp: client });

    const setupEmbeddedAPI = (_liveUrl: string) => {
      Object.defineProperty(window, 'liveURL', {
        configurable: false,
        enumerable: false,
        value: () => _liveUrl,
        writable: false,
      });
    };

    const liveUrl = makeExternalUrl(`/live?t=${targetInfo.targetId}`);

    await Promise.all([
      page.evaluate(setupEmbeddedAPI, liveUrl),
      page.evaluateOnNewDocument(setupEmbeddedAPI, liveUrl),
    ]);
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
          console.log('Stopping screencast');

          await client.send(payload.command);

          await page.evaluate(() => {
            // @ts-ignore
            window.liveComplete();
          });

          break;
        }
        case LIVE_COMMANDS.INPUT_DISPATCH_KEY_EVENT: {
          if (
            ['Delete', 'Backspace'].includes(payload.params.code) &&
            payload.params.type === 'keyDown'
          ) {
            console.log('Backspace detected');

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
      console.error('Error sending command', error);
      console.debug('Payload params', payload.params);
    }
  }
}
