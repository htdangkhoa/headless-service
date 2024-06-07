import { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import vanillaPuppeteer, { Browser, PuppeteerLaunchOptions } from 'puppeteer';
import { addExtra, PuppeteerExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import treeKill from 'tree-kill';
import { WebSocketServer } from 'ws';

import { DEFAULT_LAUNCH_ARGS, DEFAULT_VIEWPORT } from '@/constants';
import LiveUrlPlugin from '@/plugins/puppeteer-extra-plugin-live-url';

export class PuppeteerProvider {
  private runnings: Browser[] = [];

  private puppeteers = new WeakMap<Browser, PuppeteerExtra>();

  async launchBrowser(
    req: IncomingMessage,
    options?: {
      browserId?: string;
      ws?: WebSocketServer | false;
      // launch options
      launch?: PuppeteerLaunchOptions;
      // feature options
      stealth?: boolean;
      proxy?: string;
      block_ads?: boolean;
    }
  ) {
    const puppeteer = addExtra(vanillaPuppeteer);

    // internal plugins for puppeteer extra
    const { ws, browserId, ...restOfOptions } = options ?? {};
    if (ws) {
      puppeteer.use(LiveUrlPlugin(ws));
    }

    // if (req.url?.includes('devtools/browser') || req.url?.includes('/live')) {
    if (browserId) {
      const found = this.runnings.find((browser) => browser.wsEndpoint().includes(browserId!));

      if (!found) {
        throw new Error(`Could't locate browser "${browserId}" for request "${req.url}"`);
      }

      return found;
    }

    const { launch: launchOptions, stealth, proxy, block_ads: blockAds } = restOfOptions ?? {};

    if (stealth) {
      puppeteer.use(StealthPlugin());
    }

    const setOfArgs = new Set<string>(DEFAULT_LAUNCH_ARGS);

    (launchOptions?.args ?? []).forEach((arg) => setOfArgs.add(arg));

    if (proxy) {
      setOfArgs.add(`--proxy-server=${proxy}`);
    }

    if (blockAds) {
      const uBlock0Path = resolve(process.cwd(), 'extensions', 'ublock0.chromium');

      setOfArgs.add(`--disable-extensions-except=${uBlock0Path}`);
      setOfArgs.add(`--load-extension=${uBlock0Path}`);
    }

    const launchArgs = Array.from(setOfArgs);

    const opts: PuppeteerLaunchOptions = {
      ...(launchOptions ?? {}),
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

    this.puppeteers.set(browser, puppeteer);

    return browser;
  }

  async closeBrowser(browser: Browser) {
    const sessionId = browser.wsEndpoint().split('/').pop();
    const foundIndex = this.runnings.findIndex((b) => b.wsEndpoint().includes(sessionId!));
    const [found] = this.runnings.splice(foundIndex, 1);

    if (found) {
      const puppeteer = this.puppeteers.get(found);
      if (puppeteer) {
        this.puppeteers.delete(found);
      }

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
