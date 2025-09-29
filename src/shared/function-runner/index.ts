import puppeteer from 'puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js';
import { Browser } from 'puppeteer-core/lib/esm/puppeteer/api/Browser';
import { Page } from 'puppeteer-core/lib/esm/puppeteer/api/Page';

import { Dictionary } from '@/types';

export interface IFunctionRunnerConstructorConfigs {
  token: string;
  browserWSEndpoint: string;
}

export interface ICodeRunner {
  (params: { page: Page; context?: Dictionary }): Promise<any>;
}

export class FunctionRunner {
  private browser?: Browser;
  private page?: Page;

  constructor(readonly configs: IFunctionRunnerConstructorConfigs) {}

  async start(codeRunner: ICodeRunner) {
    const { token, browserWSEndpoint } = this.configs;

    const browserWsURL = new URL(browserWSEndpoint);
    browserWsURL.searchParams.set('token', token);

    this.browser = await puppeteer.connect({
      browserWSEndpoint: browserWsURL.href,
      headers: {
        Host: '127.0.0.1',
      },
    });
    this.browser.once('disconnected', this.stop.bind(this));
    this.page = await this.browser.newPage();

    const result = await codeRunner({ page: this.page });
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
