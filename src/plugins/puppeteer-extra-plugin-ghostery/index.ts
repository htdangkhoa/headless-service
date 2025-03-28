import { Browser, Page } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { PuppeteerBlocker, fullLists } from '@ghostery/adblocker-puppeteer';

export class PuppeteerExtraPluginGhostery extends PuppeteerExtraPlugin {
  private blocker: PuppeteerBlocker | null = null;

  get name(): string {
    return 'ghostery';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    await this.provideBlocker();
  }

  async onPageCreated(page: Page): Promise<void> {
    const blocker = await this.provideBlocker();
    await blocker.enableBlockingInPage(page);
  }

  private async provideBlocker() {
    if (!this.blocker) {
      this.blocker = await PuppeteerBlocker.fromLists(fetch, fullLists, {
        enableCompression: true,
      });
    }

    return this.blocker;
  }
}

const GhosteryPlugin = () => new PuppeteerExtraPluginGhostery();

export default GhosteryPlugin;
