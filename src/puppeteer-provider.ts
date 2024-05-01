import type { Browser, PuppeteerLaunchOptions } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { AsyncArray } from '@/utils';
import { DEFAULT_LAUNCH_ARGS, DEFAULT_VIEWPORT } from '@/constants';

export class PuppeteerProvider {
  swarms = new AsyncArray<Browser>();

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

  async cleanup(browser: Browser, closeBrowser = false) {
    browser.removeAllListeners();
    if (closeBrowser) {
      await browser.close();
    }
    this.swarms.remove(browser);
  }
}
