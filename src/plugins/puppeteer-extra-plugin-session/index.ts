import { Browser, Frame, Page } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';

import { getBrowserId, patchNamedFunctionESBuildIssue2605 } from '@/utils';
import { makeExternalUrl } from '@/utils';

export interface IEmbeddedAPIMeta {
  reconnectUrl: string;
  api: {
    endpoint: string;
    method: string;
  };
}

export class PuppeteerExtraPluginSession extends PuppeteerExtraPlugin {
  private reconnectUrl: string | null = null;
  private apiEndpoint: string | null = null;

  constructor() {
    super();
  }

  get name(): string {
    return 'session';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    const sessionId = getBrowserId(browser);

    const reconnectUrl = makeExternalUrl('ws', 'devtools', 'browser', sessionId);
    this.reconnectUrl = reconnectUrl;

    const apiEndpoint = makeExternalUrl('http', 'internal', 'browser', sessionId, 'session');
    this.apiEndpoint = apiEndpoint;
  }

  async onDisconnected(): Promise<void> {
    this.reconnectUrl = null;
    this.apiEndpoint = null;
  }

  async onPageCreated(page: Page): Promise<void> {
    await patchNamedFunctionESBuildIssue2605(page);

    const self = this;

    page.on('framenavigated', self.onFrameNavigated.bind(self));

    page.on('framedetached', (frame: Frame) => {
      page.off('framenavigated', self.onFrameNavigated);
    });

    await this.injectSessionAPI(page);
  }

  private async onFrameNavigated(frame: Frame) {
    if (frame.detached) return;

    if (frame.parentFrame()?.detached) return;

    const page = frame.page();

    if (page.isClosed()) return;

    await this.injectSessionAPI(frame);
  }

  private async injectSessionAPI(target: Page | Frame) {
    if (!(target instanceof Page) && !(target instanceof Frame))
      throw new Error('Target must be either a Page or a Frame');

    const setupEmbeddedAPI = (meta: IEmbeddedAPIMeta) => {
      const { reconnectUrl, api } = meta;

      Object.defineProperty(window, 'keepAlive', {
        configurable: false,
        enumerable: false,
        value: async (ms: number) => {
          const response = await fetch(api.endpoint, {
            method: api.method,
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keep_alive: ms }),
          });

          if (!response.ok) {
            throw new Error('Failed to keep alive');
          }

          return reconnectUrl;
        },
        writable: false,
      });
    };

    const meta: IEmbeddedAPIMeta = {
      reconnectUrl: this.reconnectUrl!,
      api: {
        endpoint: this.apiEndpoint!,
        method: 'PUT',
      },
    };

    const promises: any[] = [
      target.waitForNavigation({ timeout: 0 }),
      target.evaluate(setupEmbeddedAPI, meta),
    ];

    if (target instanceof Page) {
      promises.push(target.evaluateOnNewDocument(setupEmbeddedAPI, meta));
    }

    await Promise.allSettled(promises);
  }
}

const SessionPlugin = () => new PuppeteerExtraPluginSession();

export default SessionPlugin;
