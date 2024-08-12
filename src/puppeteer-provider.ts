import { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import vanillaPuppeteer from 'puppeteer';
import type { Browser, PuppeteerLaunchOptions } from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import treeKill from 'tree-kill';
import { WebSocketServer } from 'ws';
import dayjs from 'dayjs';

import { DEFAULT_LAUNCH_ARGS } from '@/constants';
import SessionPlugin from '@/plugins/puppeteer-extra-plugin-session';
import HelperPlugin from '@/plugins/puppeteer-extra-plugin-helper';
import LiveUrlPlugin from '@/plugins/puppeteer-extra-plugin-live-url';
import UnblockPlugin from '@/plugins/puppeteer-extra-plugin-unblock';
import { getBrowserId } from '@/utils/puppeteer';

export interface Session {
  browserId: string;
  browser: Browser;
  expires_at: Date | null;
}

export class PuppeteerProvider {
  private readonly sessionMap = new Map<string, Session>();

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
      unblock?: boolean;
    }
  ) {
    const puppeteer = addExtra(vanillaPuppeteer);
    puppeteer.use(SessionPlugin(this));
    puppeteer.use(HelperPlugin());

    // internal plugins for puppeteer extra
    const {
      browserId,
      ws,
      stealth,
      unblock,
      block_ads: blockAds,
      proxy,
      launch: launchOptions,
    } = options ?? {};

    if (browserId) {
      const found = this.sessionMap.get(browserId);

      if (!found) {
        throw new Error(`Could't locate browser "${browserId}" for request "${req.url}"`);
      }

      if (dayjs(found.expires_at).isValid()) {
        const now = dayjs();

        if (dayjs(found.expires_at).isAfter(now)) {
          throw new Error("Browser's session has expired");
        }
      }

      return found.browser;
    }

    if (ws) {
      puppeteer.use(LiveUrlPlugin(ws));
    }

    if (stealth) {
      puppeteer.use(StealthPlugin());
    }

    if (unblock) {
      puppeteer.use(UnblockPlugin());
    }

    const setOfArgs = new Set<string>(DEFAULT_LAUNCH_ARGS);

    (launchOptions?.args ?? []).forEach((arg) => setOfArgs.add(arg));

    if (proxy) {
      setOfArgs.add(`--proxy-server=${proxy}`);
    }

    const _launchOptions = Object.assign({}, launchOptions);
    if (blockAds) {
      if (_launchOptions.headless === 'shell') {
        _launchOptions.headless = false;
      }
      const uBlock0Path = resolve(process.cwd(), 'extensions', 'uBlock0.chromium');

      setOfArgs.add(`--disable-extensions-except=${uBlock0Path}`);
      setOfArgs.add(`--load-extension=${uBlock0Path}`);
    }

    const launchArgs = Array.from(setOfArgs);

    const opts: PuppeteerLaunchOptions = {
      ..._launchOptions,
      executablePath: puppeteer.executablePath(),
      args: launchArgs,
      defaultViewport: null,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      waitForInitialPage: false,
      ignoreHTTPSErrors: true,
    };

    const browser = await puppeteer.launch(opts);

    const sessionId = getBrowserId(browser);

    this.sessionMap.set(sessionId, {
      browserId: sessionId,
      browser,
      expires_at: null,
    });

    return browser;
  }

  async exit(browser: Browser) {
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

  async complete(browser: Browser) {
    const sessionId = getBrowserId(browser);
    const found = this.sessionMap.get(sessionId);

    let shouldExit = true;

    if (found && dayjs(found.expires_at).isValid()) {
      const now = dayjs();

      if (dayjs(found.expires_at).isBefore(now)) {
        shouldExit = false;
      }
    }

    if (shouldExit) {
      await this.exit(browser);
      this.sessionMap.delete(sessionId);
    }
  }

  async close() {
    const sessions = this.sessionMap.values();

    const browsers = Array.from(sessions, (session) => session.browser);

    await Promise.all(browsers.map((browser) => this.exit(browser)));
  }

  setExpiresAt(browserId: string, expiresAt: Date) {
    const found = this.sessionMap.get(browserId);

    if (found) {
      found.expires_at = expiresAt;

      this.sessionMap.set(browserId, found);
    }
  }
}
