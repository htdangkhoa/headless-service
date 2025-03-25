import type { Browser } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { get, isNil } from 'lodash-es';

import { buildProtocolEventNames, buildProtocolMethod, getBrowserId } from '@/utils';
import { makeExternalUrl } from '@/utils';
import { COMMANDS, DOMAINS } from '@/constants';
import { DispatchResponse, Request, Response } from '@/cdp/devtools';

export class PuppeteerExtraPluginSession extends PuppeteerExtraPlugin {
  private browser: Browser | null = null;

  private readonly PROTOCOL_METHODS = {
    KEEP_ALIVE: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.KEEP_ALIVE),
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

    const { eventNameForListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.KEEP_ALIVE
    );

    browser.on(eventNameForListener, this.onKeepAlive.bind(this));
  }

  async onDisconnected(): Promise<void> {
    this.browser = null;
  }

  private async onKeepAlive(payload: any) {
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

    const apiEndpoint = makeExternalUrl('http', 'internal', 'browser', browserId, 'session');

    const fetchResponse = await fetch(apiEndpoint, {
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
}

const SessionPlugin = () => new PuppeteerExtraPluginSession();

export default SessionPlugin;
