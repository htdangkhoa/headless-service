import type { Browser, Page } from 'puppeteer';
import { HEADLESS_PAGE_IDENTIFIER } from '@/constants';

export const getBrowserId = (browser: Browser): string => {
  const wsEndpoint = browser.wsEndpoint();
  const browserId = wsEndpoint.split('/').pop();
  return browserId!;
};

export const generatePageId = (): string => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const id = Array.from({ length: 32 - HEADLESS_PAGE_IDENTIFIER.length })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join('');

  return HEADLESS_PAGE_IDENTIFIER.concat(id);
};

declare global {
  interface Window {
    __name: (func: Function) => Function;
  }
}

/** Error [ReferenceError]: __name is not defined
 * Issue: https://github.com/evanw/esbuild/issues/2605
 * Solution: https://github.com/evanw/esbuild/issues/2605#issuecomment-2050808084 (comment)
 */
export const patchNamedFunctionESBuildIssue2605 = (page: Page) => {
  return Promise.race([
    page.evaluateOnNewDocument(() => (window.__name = (func: Function) => func)),
    page.evaluate(() => (window.__name = (func: Function) => func)),
  ]);
};
