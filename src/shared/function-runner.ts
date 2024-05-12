import { BrowserWebSocketTransport } from 'puppeteer-core/lib/esm/puppeteer/common/BrowserWebSocketTransport.js';
import { _connectToCdpBrowser as connect } from 'puppeteer-core/lib/esm/puppeteer/cdp/BrowserConnector.js';
import { Browser } from 'puppeteer-core/lib/esm/puppeteer/api/Browser';
import { Page } from 'puppeteer-core/lib/esm/puppeteer/api/Page';

export class FunctionRunner {
  private browser?: Browser;
  private page?: Page;

  constructor() {}

  async start(browserWSEndpoint: string) {
    const connectionTransport = await BrowserWebSocketTransport.create(browserWSEndpoint);
    const cdpOptions = {
      headers: {
        Host: '127.0.0.1',
      },
    };

    this.browser = await connect(connectionTransport, browserWSEndpoint, cdpOptions);
    this.page = await this.browser.newPage();

    return 'ok';
  }
}

Object.defineProperty(window, 'BrowserFunctionRunner', {
  value: FunctionRunner,
  writable: false,
  configurable: false,
  enumerable: false,
});
