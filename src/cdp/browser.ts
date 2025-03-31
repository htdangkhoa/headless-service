import EventEmitter from 'events';
import { resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import vanillaPuppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { DEFAULT_LAUNCH_ARGS } from '@/constants';
import SessionPlugin from '@/plugins/puppeteer-extra-plugin-session';
import HelperPlugin from '@/plugins/puppeteer-extra-plugin-helper';
import LiveUrlPlugin from '@/plugins/puppeteer-extra-plugin-live-url';
import UnblockPlugin from '@/plugins/puppeteer-extra-plugin-unblock';
import RecorderPlugin from '@/plugins/puppeteer-extra-plugin-recorder';
import GhosteryPlugin from '@/plugins/puppeteer-extra-plugin-ghostery';
import { getBrowserId } from '@/utils/puppeteer';
import { HeadlessServiceDomainRegistry, Protocol } from './devtools';
import { Logger } from '@/logger';

export interface BrowserCDPOptions {
  // launch options
  launch?: LaunchOptions;
  // feature options
  stealth?: boolean;
  proxy?: string;
  block_ads?: boolean;
  unblock?: boolean;
  request_id?: string;
}

export class BrowserCDP extends EventEmitter {
  private readonly logger = new Logger(this.constructor.name);

  private browser: Browser | null = null;

  private browserWSEndpoint: string | null = null;

  private wsServer: WebSocketServer | null = null;

  expiresAt: Date | null = null;

  private record: boolean = false;

  private protocol: Protocol | null = null;

  constructor(private options?: BrowserCDPOptions) {
    super();

    this.setMaxListeners(Infinity);
  }

  setWsServer(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  setExpiresAt(expiresAt: Date) {
    this.expiresAt = expiresAt;
  }

  setRecord(record: boolean) {
    this.record = record;
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

    const extensionPaths: string[] = [];

    if (blockAds) {
      puppeteer.use(GhosteryPlugin());
    }

    if (this.record) {
      puppeteer.use(RecorderPlugin());

      // Must be false to enable the browser UI
      _launchOptions.headless = false;

      const recordPath = resolve(process.cwd(), 'extensions', 'recorder');
      extensionPaths.push(recordPath);
    }

    if (extensionPaths.length) {
      if (_launchOptions.headless === 'shell') {
        _launchOptions.headless = false;
      }

      setOfArgs.add(`--disable-extensions-except=${extensionPaths.join(',')}`);
      setOfArgs.add(`--load-extension=${extensionPaths.join(',')}`);
    }

    const launchArgs = Array.from(setOfArgs);

    const opts: LaunchOptions = {
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
      this.wsServer?.removeAllListeners();
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

  async getJSONProtocol() {
    if (this.protocol) {
      return this.protocol;
    }

    if (!this.browser) {
      throw new Error(`${this.constructor.name} is not launched yet`);
    }

    try {
      const browserWSEndpoint = this.wsEndpoint();

      const { host } = new URL(browserWSEndpoint!);
      const response = await fetch(`http://${host}/json/protocol`);
      const protocol = (await response.json()) as Protocol;

      const headlessServiceDomain = new HeadlessServiceDomainRegistry().buildDomain();

      protocol.domains = protocol.domains.concat(headlessServiceDomain);

      this.protocol = protocol;

      return this.protocol!;
    } catch (error) {
      this.logger.error('Error getting JSON protocol', error);

      throw new Error('Error getting JSON protocol');
    }
  }

  getPuppeteerBrowser() {
    return this.browser;
  }

  async getPageById(pageId: string) {
    if (!this.browser) {
      throw new Error(`${this.constructor.name} is not launched yet`);
    }

    const pages = await this.browser.pages();

    // @ts-expect-error
    const page = pages.find((p) => p.target()._targetId === pageId);

    return page;
  }
}
