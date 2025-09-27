import type { Browser } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { get, isNil } from 'lodash-es';

import { buildProtocolEventNames, buildProtocolMethod, env, getBrowserId } from '@/utils';
import { makeExternalUrl } from '@/utils';
import { COMMANDS, DOMAINS } from '@/constants';
import { DispatchResponse, Request, Response } from '@/cdp/devtools';

export class PuppeteerExtraPluginSession extends PuppeteerExtraPlugin {
  private browser: Browser | null = null;

  private readonly PROTOCOL_METHODS = {
    KEEP_ALIVE: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.KEEP_ALIVE),
    DEBUGGER_URL: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.DEBUGGER_URL),
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
    const { eventNameForListener: debuggerUrlEventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.DEBUGGER_URL
    );

    browser.on(keepAliveEventNameForListener, this.onHeadlessServiceKeepAlive.bind(this));
    browser.on(debuggerUrlEventNameForListener, this.onHeadlessServiceDebuggerUrl.bind(this));
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

    if (isNil(ms)) {
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
      body: JSON.stringify({ keep_alive: ms }),
    });

    if (!fetchResponse.ok) {
      // throw new Error('Failed to keep alive');
      const dispatchResponse = DispatchResponse.InternalError('Failed to keep alive');
      const response = Response.error(request.id!, dispatchResponse, request.sessionId);
      return this.browser.emit(eventNameForResult, response);
    }

    const reconnectUrl = makeExternalUrl('ws', 'devtools', 'browser', browserId);

    const response = Response.success(request.id!, { reconnectUrl }, request.sessionId);
    return this.browser.emit(eventNameForResult, response);
  }

  private async onHeadlessServiceDebuggerUrl(payload: any) {
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
          webSocketDebuggerUrl: webSocketDebuggerURL.href,
          devtoolsFrontendUrl: devtoolsFrontendURL.href,
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
}

const SessionPlugin = () => new PuppeteerExtraPluginSession();

export default SessionPlugin;
