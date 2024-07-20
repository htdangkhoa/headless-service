import {} from 'puppeteer';

export interface IPageHelper {
  scrollThroughPage(): Promise<void>;
  waitForEvent(event: string, timeout?: number): Promise<void>;
}

declare module 'puppeteer' {
  interface Page extends IPageHelper {}
}

declare module 'puppeteer-core' {
  interface Page extends IPageHelper {}
}
