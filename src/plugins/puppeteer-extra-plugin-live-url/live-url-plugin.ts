import { makeExternalUrl } from '@/utils';
import { Page } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';

export class PuppeteerExtraPluginLiveUrl extends PuppeteerExtraPlugin {
  get name(): string {
    return 'live-url';
  }

  async onPageCreated(page: Page): Promise<void> {
    const browserId = page.browser().wsEndpoint().split('/').pop();

    const client = await page.createCDPSession();

    const sessionId = client.id();

    page.exposeFunction('liveURL', () => {
      return makeExternalUrl(`/live?b=${browserId}&s=${sessionId}`);
    });
  }
}
