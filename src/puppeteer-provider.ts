import type { Browser, PuppeteerLaunchOptions } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import treeKill from 'tree-kill';

import { DEFAULT_LAUNCH_ARGS, DEFAULT_VIEWPORT } from '@/constants';

export class PuppeteerProvider {
  private runnings: Browser[] = [];

  async launchBrowser(options?: PuppeteerLaunchOptions) {
    puppeteer.use(StealthPlugin());

    const launchArgs = Array.from<string>({ length: 0 }).concat(
      DEFAULT_LAUNCH_ARGS,
      options?.args ?? []
    );

    const opts: PuppeteerLaunchOptions = {
      ...(options ?? {}),
      headless: false,
      executablePath: puppeteer.executablePath(),
      args: launchArgs,
      defaultViewport: DEFAULT_VIEWPORT,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      waitForInitialPage: false,
    };

    const browser = await puppeteer.launch(opts);

    this.runnings.push(browser);

    return browser;
  }

  async closeBrowser(browser: Browser) {
    const pages = await browser.pages();

    pages.forEach((page) => {
      page.removeAllListeners();
      // @ts-ignore
      page = null;
    });
    browser.removeAllListeners();

    try {
      await browser.close();
    } catch (error) {
      console.error('Error closing browser', error);
    } finally {
      const proc = browser.process();
      if (proc && proc.pid) {
        treeKill(proc.pid, 'SIGKILL');
      }
    }
  }

  async close() {
    await Promise.all(this.runnings.map((browser) => this.closeBrowser(browser)));
  }
}
