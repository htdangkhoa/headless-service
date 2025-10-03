import { IncomingMessage } from 'node:http';
import dayjs from 'dayjs';
import type { Page } from 'puppeteer';
import treeKill from 'tree-kill';
import { WebSocketServer } from 'ws';

import { Logger } from '@/logger';
import { IBrowserSession } from '@/schemas';
import { makeExternalUrl } from '@/utils';

import { BrowserCDP, BrowserCDPOptions } from './browser';

export interface IRequestBrowserOptions extends BrowserCDPOptions {
  browserId?: string;
  ws?: WebSocketServer | false;
  record?: boolean;
}

export class BrowserManager {
  private readonly logger = new Logger(this.constructor.name);

  private browsers = new Map<string, BrowserCDP>();

  private timers = new Map<string, NodeJS.Timeout>();

  async requestBrowser(req: IncomingMessage, options?: IRequestBrowserOptions) {
    const { browserId, ws, record, ...browserCDPOptions } = options ?? {};

    if (browserId) {
      const found = this.browsers.get(browserId);

      if (!found) {
        throw new Error(`Could't locate browser "${browserId}" for request "${req.url}"`);
      }

      const expiresAt = dayjs(found.expiresAt);

      if (expiresAt.isValid()) {
        const now = dayjs();

        if (!expiresAt.isAfter(now)) {
          throw new Error("Browser's session has expired");
        }
      }

      return found;
    }

    const browser = new BrowserCDP(browserCDPOptions);
    if (ws instanceof WebSocketServer) {
      browser.setWsServer(ws);
    }
    browser.setRecord(!!record);
    await browser.launch();

    const sessionId = browser.id();
    this.browsers.set(sessionId, browser);

    return browser;
  }

  async close(browser: BrowserCDP) {
    const sessionId = browser.id();

    const pages = await browser.pages();

    pages.forEach((page) => {
      page.removeAllListeners();

      // @ts-ignore
      page = null;
    });
    browser.removeAllListeners();

    try {
      browser.close();
    } finally {
      const proc = browser.process();
      if (proc && proc.pid) {
        treeKill(proc.pid, 'SIGKILL');
      }

      this.browsers.delete(sessionId);

      const timer = this.timers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(sessionId);
      }
    }
  }

  async complete(browser: BrowserCDP) {
    const sessionId = browser.id();

    const found = this.browsers.get(sessionId);

    let shouldExit = true;

    if (found && dayjs(found.expiresAt).isValid()) {
      const now = dayjs();

      const expiresAt = dayjs(found.expiresAt);

      if (!expiresAt.isBefore(now)) {
        shouldExit = false;

        const timeout = expiresAt.diff(now);

        const timer = setTimeout(() => {
          const browser = this.browsers.get(sessionId);
          if (browser) {
            this.close(browser);
          }
        }, timeout);

        this.timers.set(sessionId, timer);
      }
    }

    if (shouldExit) {
      await this.close(browser);
    }
  }

  async shutdown() {
    const browsers = Array.from(this.browsers.values()).filter(Boolean);

    await Promise.all(browsers.map((browser) => this.close(browser)));
    this.browsers.clear();

    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  async getJSONList() {
    const externalAddress = makeExternalUrl('http');
    const externalWSAddress = makeExternalUrl('ws');
    const externalURL = new URL(externalWSAddress);

    const browsers = Array.from(this.browsers.values()).filter(Boolean);

    const promises = browsers.map(async (browser) => {
      const browserWSEndpoint = browser.wsEndpoint();
      if (!browserWSEndpoint) return null;
      const { host } = new URL(browserWSEndpoint);
      const response = await fetch(`http://${host}/json/list`);
      const cdpJSON = await response.json();
      return cdpJSON.map((c: any) => {
        const webSocketDebuggerURL = new URL(c.webSocketDebuggerUrl);
        webSocketDebuggerURL.host = externalURL.host;
        webSocketDebuggerURL.port = externalURL.port;
        webSocketDebuggerURL.protocol = externalURL.protocol;

        const wsProxyUrl = webSocketDebuggerURL.href.replace(
          `${webSocketDebuggerURL.protocol}//`,
          ''
        );
        const devtoolsFrontendURL = new URL('/devtools/inspector.html', externalAddress);
        devtoolsFrontendURL.searchParams.set(
          webSocketDebuggerURL.protocol.replace(':', ''),
          wsProxyUrl
        );

        return {
          ...c,
          devtoolsFrontendUrl: devtoolsFrontendURL.href,
          webSocketDebuggerUrl: webSocketDebuggerURL.href,
        };
      });
    });

    const cdpResponse = await Promise.all(promises);

    return cdpResponse.flat().filter(Boolean);
  }

  async getJSONVersion() {
    const browser = new BrowserCDP();

    try {
      await browser.launch();

      const browserWSEndpoint = browser.wsEndpoint()!;

      const { host } = new URL(browserWSEndpoint);
      const response = await fetch(`http://${host}/json/version`);
      const meta = await response.json();

      const { 'WebKit-Version': webkitVersion } = meta;
      const debuggerVersion = webkitVersion.match(/\s\(@(\b[0-9a-f]{5,40}\b)/)[1];

      const webSocketDebuggerUrl = makeExternalUrl('ws');

      return {
        ...meta,
        'Debugger-Version': debuggerVersion,
        webSocketDebuggerUrl,
      };
    } catch (error) {
      this.logger.error('Error getting JSON version', error);

      throw new Error('Error getting JSON version');
    } finally {
      browser.close();
    }
  }

  getBrowserById(browserId: string) {
    return this.browsers.get(browserId);
  }

  getPageId(page: Page) {
    return page.target()._targetId;
  }

  async getBrowserByPageId(pageId: string) {
    const browsers = Array.from(this.browsers.values()).filter(Boolean);

    let foundBrowser: BrowserCDP | null = null;

    for (const browser of browsers) {
      const pages = await browser.pages();

      const found = pages.find((page) => this.getPageId(page) === pageId);

      if (found) {
        foundBrowser = browser;
        break;
      }
    }

    return foundBrowser;
  }

  getAllSessions() {
    const cdpBrowsers = Array.from(this.browsers.values()).filter(Boolean);

    const sessions: IBrowserSession[] = [];

    for (const browser of cdpBrowsers) {
      const browserId = browser.id();

      const userDataDir = browser.userDataDir();

      const externalAddress = makeExternalUrl('http', 'management', 'kill', browserId);

      sessions.push({
        browserId,
        killUrl: externalAddress,
        userDataDir,
      });
    }

    return sessions;
  }
}
