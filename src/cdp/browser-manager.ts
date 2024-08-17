import { IncomingMessage } from 'node:http';
import * as path from 'node:path';
import treeKill from 'tree-kill';
import dayjs from 'dayjs';
import type { Page } from 'puppeteer';
import { WebSocketServer } from 'ws';

import { BrowserCDP, BrowserCDPOptions } from './browser';
import { Dictionary } from '@/types';
import { makeExternalUrl } from '@/utils';

export interface IRequestBrowserOptions extends BrowserCDPOptions {
  browserId?: string;
  ws?: WebSocketServer | false;
}

export class BrowserManager {
  private readonly browsers = new Map<string, BrowserCDP>();

  private protocol: Dictionary | null = null;

  async requestBrowser(req: IncomingMessage, options?: IRequestBrowserOptions) {
    const { browserId, ws, ...browserCDPOptions } = options ?? {};

    if (browserId) {
      const found = this.browsers.get(browserId);

      if (!found) {
        throw new Error(`Could't locate browser "${browserId}" for request "${req.url}"`);
      }

      const { expiresAt } = found;

      if (dayjs(expiresAt).isValid()) {
        const now = dayjs();

        if (dayjs(expiresAt).isAfter(now)) {
          throw new Error("Browser's session has expired");
        }
      }

      return found;
    }

    const browser = new BrowserCDP(browserCDPOptions);
    if (ws instanceof WebSocketServer) {
      browser.setWsServer(ws);
    }
    await browser.launch();

    const sessionId = browser.id();
    this.browsers.set(sessionId, browser);

    return browser;
  }

  async close(browser: BrowserCDP) {
    const pages = await browser.pages();

    pages.forEach((page) => {
      page.removeAllListeners();

      // @ts-ignore
      page = null;
    });
    browser.removeAllListeners();

    try {
      browser.close();
    } catch (error) {
      console.error('Error closing browser', error);
    } finally {
      const proc = browser.process();
      if (proc && proc.pid) {
        treeKill(proc.pid, 'SIGKILL');
      }
    }
  }

  async complete(browser: BrowserCDP) {
    const sessionId = browser.id();

    const found = this.browsers.get(sessionId);

    let shouldExit = true;

    if (found && dayjs(found.expiresAt).isValid()) {
      const now = dayjs();

      if (dayjs(found.expiresAt).isBefore(now)) {
        shouldExit = false;
      }
    }

    if (shouldExit) {
      await this.close(browser);
      this.browsers.delete(sessionId);
    }
  }

  async shutdown() {
    const browsers = Array.from(this.browsers.values()).filter(Boolean);

    await Promise.all(browsers.map((browser) => this.close(browser)));
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

        const devtoolsFrontendURL = new URL(c.devtoolsFrontendUrl, externalAddress);

        const hasWsQuery = devtoolsFrontendURL.searchParams.has('ws');

        if (hasWsQuery) {
          const paramName = externalURL.protocol.replace(':', '');
          devtoolsFrontendURL.searchParams.set(
            paramName,
            path.join(webSocketDebuggerURL.host, webSocketDebuggerURL.pathname)
          );
        }

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
      console.error('Error getting JSON version', error);

      throw new Error('Error getting JSON version');
    } finally {
      browser.close();
    }
  }

  async getJSONProtocol() {
    if (this.protocol) {
      return this.protocol;
    }

    const browser = new BrowserCDP();

    try {
      await browser.launch();

      const browserWSEndpoint = browser.wsEndpoint()!;

      const { host } = new URL(browserWSEndpoint);
      const response = await fetch(`http://${host}/json/protocol`);
      const protocol = await response.json();

      this.protocol = {
        version: protocol.version,
        domains: protocol.domains.concat({
          domain: 'HeadlessService',
          dependencies: [],
          types: [],
          commands: [
            {
              name: 'liveURL',
              parameters: [],
              returns: [
                {
                  name: 'protocol',
                  type: 'string',
                  description: 'The protocol as a string.',
                },
              ],
            },
          ],
        }),
      };

      return this.protocol;
    } catch (error) {
      console.error('Error getting JSON protocol', error);

      throw new Error('Error getting JSON protocol');
    } finally {
      browser.close();
    }
  }

  getPageId(page: Page) {
    // @ts-ignore
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
}
