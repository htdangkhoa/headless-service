import type { Page } from 'puppeteer';

export interface IBrowserHelper {
  currentPage(timeout?: number): Promise<Page>;
}

export interface IPageHelper {
  scrollThroughPage(): Promise<void>;
  waitForEvent(event: string, timeout?: number): Promise<void>;
}

declare module 'puppeteer' {
  interface Browser extends IBrowserHelper {}

  interface Page extends IPageHelper {}
}

declare module 'puppeteer-core' {
  interface Browser extends IBrowserHelper {}

  interface Page extends IPageHelper {}
}
