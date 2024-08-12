import { Page } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import dayjs from 'dayjs';

import { PuppeteerProvider } from '@/puppeteer-provider';
import { getBrowserId } from '@/utils/puppeteer';
import { makeExternalUrl } from '@/utils';

const CUSTOM_EVENT_NAME = 'headless:keepalive';

export class PuppeteerExtraPluginSession extends PuppeteerExtraPlugin {
  constructor(private readonly puppeteerProvider: PuppeteerProvider) {
    super();
  }

  get name(): string {
    return 'session';
  }

  async onPageCreated(page: Page): Promise<void> {
    const browser = page.browser();

    const sessionId = getBrowserId(browser);

    const reconnectUrl = makeExternalUrl('ws', 'devtools', 'browser', sessionId);

    const setupEmbeddedAPI = (customEventName: string, reconnectUrl: string) => {
      Object.defineProperty(window, 'keepAlive', {
        configurable: false,
        enumerable: false,
        value: (ms: number) => {
          const evt = new CustomEvent(customEventName, {
            detail: { ms },
          });
          window.dispatchEvent(evt);
          return reconnectUrl;
        },
        writable: false,
      });
    };

    await Promise.race([
      page.evaluate(setupEmbeddedAPI, CUSTOM_EVENT_NAME, reconnectUrl),
      page.evaluateOnNewDocument(setupEmbeddedAPI, CUSTOM_EVENT_NAME, reconnectUrl),
    ]);

    const keepAlive = await new Promise<any>(async (resolve) => {
      await page.exposeFunction('onHeadlessKeepAlive', (ms: number) => {
        resolve(ms);
      });
      await page.evaluateOnNewDocument((customEventName: string) => {
        // @ts-ignore
        window.addEventListener(customEventName, (e: CustomEvent) => {
          const { ms } = e.detail;

          // @ts-ignore
          window.onHeadlessKeepAlive(ms);
        });
      }, CUSTOM_EVENT_NAME);
    });

    const now = dayjs();
    const expiresAt = now.add(keepAlive, 'ms');

    this.puppeteerProvider.setExpiresAt(sessionId, expiresAt.toDate());
  }
}

const SessionPlugin = (puppeteerProvider: PuppeteerProvider) =>
  new PuppeteerExtraPluginSession(puppeteerProvider);

export default SessionPlugin;
