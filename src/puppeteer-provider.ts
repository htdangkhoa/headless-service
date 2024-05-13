import { IncomingMessage } from 'node:http';
import type { Browser, PuppeteerLaunchOptions } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import treeKill from 'tree-kill';

import { DEFAULT_LAUNCH_ARGS, DEFAULT_VIEWPORT } from '@/constants';

export class PuppeteerProvider {
  private runnings: Browser[] = [];

  async launchBrowser(req: IncomingMessage, options?: PuppeteerLaunchOptions) {
    if (req.url?.includes('devtools/browser')) {
      const sessionId = req.url.split('/').pop();
      const found = this.runnings.find((browser) => browser.wsEndpoint().includes(sessionId!));

      if (!found) {
        throw new Error(`Could't locate browser "${sessionId}" for request "${req.url}"`);
      }

      return found;
    }

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
    const sessionId = browser.wsEndpoint().split('/').pop();
    const foundIndex = this.runnings.findIndex((b) => b.wsEndpoint().includes(sessionId!));
    const [found] = this.runnings.splice(foundIndex, 1);

    if (found) {
      const pages = await found.pages();

      pages.forEach((page) => {
        page.removeAllListeners();

        // @ts-ignore
        page = null;
      });
      found.removeAllListeners();

      try {
        await found.close();
      } catch (error) {
        console.error('Error closing browser', error);
      } finally {
        const proc = found.process();
        if (proc && proc.pid) {
          treeKill(proc.pid, 'SIGKILL');
        }
      }
    }
  }

  async close() {
    await Promise.all(this.runnings.map((browser) => this.closeBrowser(browser)));
  }
}
