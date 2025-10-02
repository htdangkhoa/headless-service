import EventEmitter from 'events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { FingerprintGeneratorOptions } from 'fingerprint-generator';
import * as glob from 'glob';
import proxyChain from 'proxy-chain';
import vanillaPuppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { WebSocketServer } from 'ws';

import { DEFAULT_LAUNCH_ARGS } from '@/constants';
import { Logger } from '@/logger';
import GhosteryPlugin from '@/plugins/puppeteer-extra-plugin-ghostery';
import HelperPlugin from '@/plugins/puppeteer-extra-plugin-helper';
import LiveUrlPlugin from '@/plugins/puppeteer-extra-plugin-live-url';
import RecorderPlugin from '@/plugins/puppeteer-extra-plugin-recorder';
import SessionPlugin from '@/plugins/puppeteer-extra-plugin-session';
import UnblockPlugin from '@/plugins/puppeteer-extra-plugin-unblock';
import { UnblockOptions } from '@/schemas';
import { env, isDirectory } from '@/utils';
import { getBrowserId } from '@/utils/puppeteer';

import { HeadlessServiceDomainRegistry, Protocol } from './devtools';

export interface BrowserCDPOptions {
  // launch options
  launch?: LaunchOptions;
  // feature options
  stealth?: boolean;
  proxy?: string;
  block_ads?: boolean;
  unblock?: boolean;
  unblock_options?: UnblockOptions;
  token?: string;
  request_id?: string;
  extensions?: string[];
}

export class BrowserCDP extends EventEmitter {
  private readonly logger = new Logger(this.constructor.name);

  private virtualProfileDir: string | null = resolve(os.tmpdir(), 'headless-service', randomUUID());

  private browser: Browser | null = null;

  private browserWSEndpoint: string | null = null;

  private wsServer: WebSocketServer | null = null;

  expiresAt: Date | null = null;

  private record: boolean = false;

  private protocol: Protocol | null = null;

  private proxyUrl: string | null = null;

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
      unblock_options,
      block_ads: blockAds,
      proxy,
      launch: launchOptions,
      request_id: requestId,
      extensions,
    } = this.options ?? {};

    if (this.wsServer instanceof WebSocketServer) {
      puppeteer.use(LiveUrlPlugin(this.wsServer, requestId));
    }

    if (stealth) {
      puppeteer.use(StealthPlugin());
    }

    if (unblock) {
      const fingerprintOptions: Partial<FingerprintGeneratorOptions> = {};
      if (unblock_options) {
        fingerprintOptions.browsers = unblock_options.browsers;
        fingerprintOptions.browserListQuery = unblock_options.browserslist_query;
        fingerprintOptions.operatingSystems = unblock_options.operating_systems;
        fingerprintOptions.devices = unblock_options.devices;
        fingerprintOptions.locales = unblock_options.locales;
        fingerprintOptions.httpVersion = unblock_options.http_version;
        fingerprintOptions.strict = unblock_options.strict;
        if (unblock_options.screen) {
          fingerprintOptions.screen = {
            minWidth: unblock_options.screen.min_width,
            maxWidth: unblock_options.screen.max_width,
            minHeight: unblock_options.screen.min_height,
            maxHeight: unblock_options.screen.max_height,
          };
        }
        fingerprintOptions.mockWebRTC = unblock_options.mock_webrtc;
        fingerprintOptions.slim = unblock_options.slim;
      }

      puppeteer.use(UnblockPlugin({ fingerprintOptions }));
    }

    const setOfArgs = new Set<string>(DEFAULT_LAUNCH_ARGS);

    (launchOptions?.args ?? [])
      .filter(Boolean)
      .filter((arg) => !arg.includes('extension')) // remove extension args
      .forEach((arg) => setOfArgs.add(arg));

    if (proxy) {
      this.proxyUrl = await proxyChain.anonymizeProxy(proxy);
      setOfArgs.add(`--proxy-server=${this.proxyUrl}`);
    }

    const _launchOptions = Object.assign({}, launchOptions);

    const builtInExtensionPaths: string[] = [];

    const EXTENSIONS_PATH = env('EXTENSIONS_PATH', '');

    if (EXTENSIONS_PATH) {
      if (isDirectory(EXTENSIONS_PATH)) {
        const extensionPaths = glob.sync(join(EXTENSIONS_PATH, '*'));

        if (Array.isArray(extensions) && extensions.length) {
          const invalidExtensions = extensions.filter(
            (extension) => !extensionPaths.some((path) => path.endsWith(extension))
          );

          if (invalidExtensions.length) {
            this.logger.warn(`Invalid extensions: ${invalidExtensions.join(', ')}`);
          }

          const validExtensions = extensionPaths.filter((path) =>
            extensions.some((extension) => path.endsWith(extension))
          );

          builtInExtensionPaths.push(...validExtensions);
        }
      }
    }

    if (blockAds) {
      puppeteer.use(GhosteryPlugin());
    }

    if (this.record) {
      puppeteer.use(RecorderPlugin());

      // Must be false to enable the browser UI
      _launchOptions.headless = false;

      const recordPath = resolve(process.cwd(), 'extensions', 'recorder');
      builtInExtensionPaths.push(recordPath);
    }

    if (builtInExtensionPaths.length) {
      if (_launchOptions.headless === 'shell') {
        _launchOptions.headless = false;
      }

      setOfArgs.add(`--disable-extensions-except=${builtInExtensionPaths.join(',')}`);
      setOfArgs.add(`--load-extension=${builtInExtensionPaths.join(',')}`);
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
      userDataDir: this.virtualProfileDir ?? undefined,
    };

    const vanillaBrowser = await puppeteer.launch(opts);

    this.browser = vanillaBrowser;

    const browserWSEndpoint = vanillaBrowser.wsEndpoint();
    const browserWebSocketURL = new URL(browserWSEndpoint!);
    this.browserWSEndpoint = browserWebSocketURL.href;
  }

  id() {
    if (!this.browser) return '';

    return getBrowserId(this.browser);
  }

  userDataDir() {
    return this.virtualProfileDir;
  }

  close() {
    if (this.browser) {
      this.emit('close');
      this.browser.removeAllListeners();
      this.wsServer?.removeAllListeners();
      this.removeAllListeners();
      this.browser.close();
      if (this.virtualProfileDir) {
        fs.rmSync(this.virtualProfileDir, { recursive: true });
      }
      this.virtualProfileDir = null;
      this.browser = null;
      this.browserWSEndpoint = null;
      this.wsServer = null;
      this.expiresAt = null;
    }

    if (this.proxyUrl) {
      proxyChain.closeAnonymizedProxy(this.proxyUrl, true);
      this.proxyUrl = null;
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
