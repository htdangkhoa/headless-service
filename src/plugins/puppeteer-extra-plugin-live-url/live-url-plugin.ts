import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { Browser, Page, CDPSession } from 'puppeteer';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'node:http';

import { makeExternalUrl } from '@/utils';
import { LIVE_COMMANDS, SPECIAL_COMMANDS } from '@/constants';

export class PuppeteerExtraPluginLiveUrl extends PuppeteerExtraPlugin {
  private browser?: Browser;

  private page?: Page;

  private cdpSession?: CDPSession;

  constructor(private ws: WebSocketServer) {
    super();

    this.ws.on('connection', async (socket, req) => {
      console.log('connected from plugins');

      socket.on('message', (rawMessage) => this.messageHandler.call(this, rawMessage, socket, req));
    });
  }

  get name(): string {
    return 'live-url';
  }

  private async getCDPSession() {
    if (!this.page) {
      throw new Error('Page is not available');
    }

    if (!this.cdpSession) {
      this.cdpSession = await this.page.createCDPSession();
    }

    return this.cdpSession;
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    this.browser = browser;
  }

  async onPageCreated(page: Page): Promise<void> {
    this.page = page;

    const browserId = page.browser().wsEndpoint().split('/').pop();

    const client = await this.getCDPSession();

    const sessionId = client.id();

    await page.exposeFunction('liveURL', () => {
      return makeExternalUrl(`/live?b=${browserId}&s=${sessionId}`);
    });
  }

  private async messageHandler(rawMessage: RawData, socket: WebSocket, req: IncomingMessage) {
    const buffer = Buffer.from(rawMessage as Buffer);
    const message = Buffer.from(buffer).toString('utf8');
    const payload = JSON.parse(message);

    const client = await this.getCDPSession();

    switch (payload.command) {
      case SPECIAL_COMMANDS.SET_VIEWPORT: {
        await this.page?.setViewport(payload.params);
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
      default: {
        await client.send(payload.command, payload.params);
        break;
      }
    }

    // if (!Object.values(LIVE_COMMANDS).includes(data.command)) {
    //   console.log('🚀 ~ PuppeteerExtraPluginLiveUrl ~ messageHandler ~ data:', data);
    //   await client.send(data.command, data.params);
    // }

    // if (data.command === LIVE_COMMANDS.STOP_SCREENCAST) {
    //   await client.send('Page.stopScreencast');

    //   await client.detach();

    //   this.cdpSession = undefined;

    //   await this.browser?.close();

    //   return console.log('stop screencast');
    // }

    // ... other commands
  }
}
