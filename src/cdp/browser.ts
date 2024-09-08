import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import vanillaPuppeteer, { type Browser, type PuppeteerLaunchOptions } from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { DEFAULT_LAUNCH_ARGS } from '@/constants';
import SessionPlugin from '@/plugins/puppeteer-extra-plugin-session';
import HelperPlugin from '@/plugins/puppeteer-extra-plugin-helper';
import LiveUrlPlugin from '@/plugins/puppeteer-extra-plugin-live-url';
import UnblockPlugin from '@/plugins/puppeteer-extra-plugin-unblock';
import { getBrowserId } from '@/utils/puppeteer';

export interface BrowserCDPOptions {
  // launch options
  launch?: PuppeteerLaunchOptions;
  // feature options
  stealth?: boolean;
  proxy?: string;
  block_ads?: boolean;
  unblock?: boolean;
  request_id?: string;
}

export class BrowserCDP extends EventEmitter {
  private browser: Browser | null = null;
  private browserWSEndpoint: string | null = null;
  private wsServer: WebSocketServer | null = null;
  expiresAt: Date | null = null;

  constructor(private options?: BrowserCDPOptions) {
    super();
  }

  setWsServer(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  setExpiresAt(expiresAt: Date) {
    this.expiresAt = expiresAt;
  }

  async launch() {
    const puppeteer = addExtra(vanillaPuppeteer);

    // internal plugins for puppeteer extra
    puppeteer.use(SessionPlugin());
    puppeteer.use(HelperPlugin());

    const {
      // ws,
      stealth,
      unblock,
      block_ads: blockAds,
      proxy,
      launch: launchOptions,
      request_id: requestId,
    } = this.options ?? {};

    if (this.wsServer instanceof WebSocketServer) {
      puppeteer.use(LiveUrlPlugin(this.wsServer, requestId));
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
      acceptInsecureCerts: true,
    };

    const vanillaBrowser = await puppeteer.launch(opts);

    this.browser = vanillaBrowser;

    const browserWSEndpoint = vanillaBrowser.wsEndpoint();
    this.browserWSEndpoint = browserWSEndpoint;
  }

  id() {
    if (!this.browser) return '';

    return getBrowserId(this.browser);
  }

  close() {
    if (this.browser) {
      this.emit('close');
      this.browser.removeAllListeners();
      this.removeAllListeners();
      this.browser.close();
      this.browser = null;
      this.browserWSEndpoint = null;
      this.wsServer = null;
      this.expiresAt = null;
    }
  }

  process() {
    return this.browser?.process() ?? null;
  }

  wsEndpoint() {
    return this.browserWSEndpoint;
  }

  newPage() {
    if (!this.browser) {
      throw new Error(`${this.constructor.name} is not launched yet`);
    }

    return this.browser.newPage();
  }

  pages() {
    return this.browser?.pages() ?? [];
  }
}
