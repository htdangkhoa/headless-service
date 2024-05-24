import { IncomingMessage } from 'node:http';
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
    options?: PuppeteerLaunchOptions & {
      stealth?: boolean;
      proxy?: string;
      browserId?: string;
      ws?: WebSocketServer;
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

    if (restOfOptions?.stealth) {
      puppeteer.use(StealthPlugin());
    }

    const setOfArgs = new Set<string>(DEFAULT_LAUNCH_ARGS);

    (restOfOptions?.args ?? []).forEach((arg) => setOfArgs.add(arg));

    if (restOfOptions?.proxy) {
      setOfArgs.add(`--proxy-server=${restOfOptions.proxy}`);
    }

    const launchArgs = Array.from(setOfArgs);

    const opts: PuppeteerLaunchOptions = {
      ...(restOfOptions ?? {}),
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
