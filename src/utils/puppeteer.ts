import type { Browser } from 'puppeteer';
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
