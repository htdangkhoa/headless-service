import { BrowserWebSocketTransport } from 'puppeteer-core/lib/esm/puppeteer/common/BrowserWebSocketTransport.js';
import { _connectToCdpBrowser as connect } from 'puppeteer-core/lib/esm/puppeteer/cdp/BrowserConnector.js';
import { Browser } from 'puppeteer-core/lib/esm/puppeteer/api/Browser';
import { Page } from 'puppeteer-core/lib/esm/puppeteer/api/Page';

export class FunctionRunner {
  private browser?: Browser;
  private page?: Page;

  constructor(private browserWSEndpoint: string) {}

  async start(handler: any) {
    const connectionTransport = await BrowserWebSocketTransport.create(this.browserWSEndpoint);
    const cdpOptions = {
      headers: {
        Host: '127.0.0.1',
      },
    };

    this.browser = await connect(connectionTransport, this.browserWSEndpoint, cdpOptions);
    this.browser.once('disconnected', this.stop.bind(this));
    this.page = await this.browser.newPage();

    const result = await handler({ page: this.page });
    await this.page.close();

    return result;
  }

  async stop() {
    if (this.browser) {
      await this.browser.disconnect();
    }
  }
}

Object.defineProperty(window, 'BrowserFunctionRunner', {
  value: FunctionRunner,
  writable: false,
  configurable: false,
  enumerable: false,
});
