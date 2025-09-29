import { fullLists, PuppeteerBlocker } from '@ghostery/adblocker-puppeteer';

export class Ghostery {
  private static blocker: PuppeteerBlocker;

  static async getBlocker(): Promise<PuppeteerBlocker> {
    if (!this.blocker) {
      this.blocker = await this.initialize();
    }

    return this.blocker;
  }

  static initialize() {
    return PuppeteerBlocker.fromLists(fetch, fullLists, {
      enableCompression: true,
    });
  }
}
