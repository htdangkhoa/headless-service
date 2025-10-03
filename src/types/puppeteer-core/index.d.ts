import type { Target as PuppeteerTarget } from 'puppeteer-core';

declare module 'puppeteer-core' {
  interface Target extends PuppeteerTarget {
    _targetId: string;
  }
}
