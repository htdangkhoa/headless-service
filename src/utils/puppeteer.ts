import type { Browser } from 'puppeteer';

export const getBrowserId = (browser: Browser): string => {
  const wsEndpoint = browser.wsEndpoint();
  const browserId = wsEndpoint.split('/').pop();
  return browserId!;
};
