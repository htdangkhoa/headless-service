import type { Browser, PuppeteerLaunchOptions } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import treeKill from 'tree-kill';

import { AsyncArray } from '@/utils';
import { DEFAULT_LAUNCH_ARGS, DEFAULT_VIEWPORT } from '@/constants';

export class PuppeteerProvider {
  private swarms = new AsyncArray<Browser>();

  setSwarm(browsers?: Browser | Browser[]) {
    if (!browsers) {
      this.swarms.length = 0;
      return;
    }

    ([] as Browser[])
      .concat(browsers)
      .filter(Boolean)
      .forEach((browser) => {
        this.swarms.push(browser);
      });
  }

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
    };

    const browser = await puppeteer.launch(opts);

    this.swarms.push(browser);

    return browser;
  }

  getBrowser() {
    return this.swarms.get();
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
    await Promise.all(this.swarms.map((browser) => this.closeBrowser(browser)));
  }
}
