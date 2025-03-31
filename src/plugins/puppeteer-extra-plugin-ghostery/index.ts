import { Browser, Page } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { PuppeteerBlocker, fullLists } from '@ghostery/adblocker-puppeteer';
import { Ghostery } from '@/utils';

export class PuppeteerExtraPluginGhostery extends PuppeteerExtraPlugin {
  private blocker: PuppeteerBlocker | undefined;

  get name(): string {
    return 'ghostery';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    this.blocker = await Ghostery.getBlocker();
  }

  async onPageCreated(page: Page): Promise<void> {
    if (this.blocker) {
      await this.blocker.enableBlockingInPage(page);
    }
  }
}

const GhosteryPlugin = () => new PuppeteerExtraPluginGhostery();

export default GhosteryPlugin;
