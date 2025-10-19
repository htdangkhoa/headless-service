import { get } from 'lodash-es';
import type { Browser } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import z from 'zod';

import { DispatchResponse, Request, Response } from '@/cdp/devtools';
import { COMMANDS, DOMAINS } from '@/constants';
import {
  buildProtocolEventNames,
  buildProtocolMethod,
  env,
  getBrowserId,
  makeExternalUrl,
  useTypedParsers,
} from '@/utils';

export class PuppeteerExtraPluginSession extends PuppeteerExtraPlugin {
  private browser: Browser | null = null;

  private readonly PROTOCOL_METHODS = {
    KEEP_ALIVE: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.KEEP_ALIVE),
    DEBUGGER_URL: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.DEBUGGER_URL),
    BROWSER_ID: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.BROWSER_ID),
    PAGE_ID: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.PAGE_ID),
  };

  constructor() {
    super();
  }

  get name(): string {
    return 'session';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    this.browser = browser;

    const browserId = getBrowserId(browser);

    const { eventNameForListener: keepAliveEventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.KEEP_ALIVE
    );
    const { eventNameForListener: debuggerURLEventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.DEBUGGER_URL
    );
    const { eventNameForListener: browserIdEventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.BROWSER_ID
    );
    const { eventNameForListener: pageIdEventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.PAGE_ID
    );

    browser.on(keepAliveEventNameForListener, this.onHeadlessServiceKeepAlive.bind(this));
    browser.on(debuggerURLEventNameForListener, this.onHeadlessServiceDebuggerURL.bind(this));
    browser.on(browserIdEventNameForListener, this.onHeadlessServiceBrowserId.bind(this));
    browser.on(pageIdEventNameForListener, this.onHeadlessServicePageId.bind(this));
  }

  async onDisconnected(): Promise<void> {
    this.browser = null;
  }

  private async onHeadlessServiceKeepAlive(payload: any) {
    const request = Request.parse(payload);

    if (!this.browser) return;

    const currentPage = await this.browser.currentPage();

    if (!currentPage) return;

    const ms = get(request, 'params.ms');

    const browserId = getBrowserId(this.browser);

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.KEEP_ALIVE
    );

    const { error, data: keepAliveMs } = useTypedParsers(z.number()).safeParse(ms as any);

    if (error) {
      const dispatchResponse = DispatchResponse.InvalidParams(
        `Invalid parameters Failed to deserialize params.ms`
      );
      const response = Response.error(request.id!, dispatchResponse, request.sessionId);
      return this.browser.emit(eventNameForResult, response);
    }

    const secret = env('SECRET')!;
    const apiEndpoint = makeExternalUrl('http', 'internal', 'browser', browserId, 'session');
    const apiUrl = new URL(apiEndpoint);
    apiUrl.searchParams.append('secret', secret);

    const fetchResponse = await fetch(apiUrl.href, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keep_alive: keepAliveMs }),
    });

    if (!fetchResponse.ok) {
      // throw new Error('Failed to keep alive');
      const dispatchResponse = DispatchResponse.InternalError('Failed to keep alive');
      const response = Response.error(request.id!, dispatchResponse, request.sessionId);
      return this.browser.emit(eventNameForResult, response);
    }

    const { data: expiresAt } = await fetchResponse.json();

    const reconnectUrl = makeExternalUrl('ws', 'devtools', 'browser', browserId);

    const response = Response.success(
      request.id!,
      {
        reconnectUrl,
        expiresAt,
      },
      request.sessionId
    );
    return this.browser.emit(eventNameForResult, response);
  }

  private async onHeadlessServiceDebuggerURL(payload: any) {
    const request = Request.parse(payload);

    if (!this.browser) return;

    if (request.method !== this.PROTOCOL_METHODS.DEBUGGER_URL) return;

    const browserId = getBrowserId(this.browser);

    let response: any = null;

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.DEBUGGER_URL
    );

    try {
      const currentPage = await this.browser.currentPage();

      const client = await currentPage.createCDPSession();

      const {
        targetInfo: { targetId },
      } = await client.send('Target.getTargetInfo');

      const wsUrl = makeExternalUrl('ws', 'devtools', 'page', targetId);

      const webSocketDebuggerURL = new URL(wsUrl);

      const wsProxyUrl = webSocketDebuggerURL.href.replace(
        `${webSocketDebuggerURL.protocol}//`,
        ''
      );
      const inspectUrl = makeExternalUrl('http', 'devtools', 'inspector.html');
      const devtoolsFrontendURL = new URL(inspectUrl);
      devtoolsFrontendURL.searchParams.set(
        webSocketDebuggerURL.protocol.replace(':', ''),
        wsProxyUrl
      );

      response = Response.success(
        request.id!,
        {
          webSocketDebuggerURL: webSocketDebuggerURL.href,
          devtoolsFrontendURL: devtoolsFrontendURL.href,
        },
        request.sessionId
      );
    } catch (error: any) {
      const dispatchResponse = DispatchResponse.InternalError(error.message);

      response = Response.error(request.id!, dispatchResponse, payload.sessionId);
    } finally {
      return this.browser.emit(eventNameForResult, response);
    }
  }

  private async onHeadlessServiceBrowserId(payload: any) {
    const request = Request.parse(payload);

    if (!this.browser) return;

    if (request.method !== this.PROTOCOL_METHODS.BROWSER_ID) return;

    const browserId = getBrowserId(this.browser);

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.BROWSER_ID
    );

    const response = Response.success(request.id!, { browserId }, request.sessionId);
    return this.browser.emit(eventNameForResult, response);
  }

  private async onHeadlessServicePageId(payload: any) {
    const request = Request.parse(payload);

    if (!this.browser) return;

    if (request.method !== this.PROTOCOL_METHODS.PAGE_ID) return;

    const browserId = getBrowserId(this.browser);

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.PAGE_ID
    );

    const currentPage = await this.browser.currentPage();

    if (!currentPage) {
      const dispatchResponse = DispatchResponse.InternalError('No current page');
      const response = Response.error(request.id!, dispatchResponse, request.sessionId);
      return this.browser.emit(eventNameForResult, response);
    }

    const response = Response.success(
      request.id!,
      { pageId: currentPage.target()._targetId },
      request.sessionId
    );
    return this.browser.emit(eventNameForResult, response);
  }
}

const SessionPlugin = () => new PuppeteerExtraPluginSession();

export default SessionPlugin;
