import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import type { Browser, Page } from 'puppeteer';

import { DEFAULT_TIMEOUT } from '@/constants';
import { sleep } from '@/utils';

export class PuppeteerExtraPluginHelper extends PuppeteerExtraPlugin {
  get name(): string {
    return 'helper';
  }

  onBrowser(browser: Browser, opts: any): Promise<void> {
    browser.currentPage = (timeout = DEFAULT_TIMEOUT) => {
      const start = Date.now();

      return new Promise<Page>(async (resolve) => {
        while (Date.now() - start < timeout) {
          const pages = await browser.pages();

          for (const page of pages) {
            const isVisible = await page.evaluate(() => document.visibilityState === 'visible');

            if (isVisible) {
              return resolve(page);
            }
          }
        }

        throw new Error('Unable to get current page');
      });
    };

    return Promise.resolve();
  }

  async onPageCreated(page: Page): Promise<void> {
    // await patchNamedFunctionESBuildIssue2605(page);

    page.scrollThroughPage = this.scrollThroughPage.bind(this, page);
    page.waitForEvent = this.waitForEvent.bind(this, page);
  }

  private async scrollThroughPage(page: Page) {
    const viewport = await page.evaluate(() => {
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

      return {
        width: vw,
        height: vh,
      };
    });

    await page.evaluate((bottomThreshold) => {
      const scrollInterval = 100;
      const scrollStep = Math.floor(bottomThreshold / 10);

      const getBottomPosition = () => window.scrollY + window.innerHeight;

      return new Promise<void>((resolve) => {
        const timeoutIds: any[] = [];

        function scrollDown() {
          window.scrollBy(0, scrollStep);

          if (document.body.scrollHeight - getBottomPosition() < bottomThreshold) {
            window.scrollTo(0, 0);
            const timeoutId = setTimeout(() => {
              timeoutIds.forEach(clearTimeout);
              resolve();
            }, scrollInterval);
            timeoutIds.push(timeoutId);
            return;
          }

          const timeoutId = setTimeout(scrollDown, scrollInterval);
          timeoutIds.push(timeoutId);
        }

        scrollDown();
      });
    }, viewport.height);
  }

  private async waitForEvent(page: Page, eventName: string, timeout: number = DEFAULT_TIMEOUT) {
    const waitEvent = async (eventName: string) => {
      await new Promise<void>((resolve) => {
        document.addEventListener(eventName, () => resolve(), { once: true });
      });
    };

    await Promise.race([
      page.evaluate(waitEvent, eventName),
      sleep(timeout).then(() => {
        throw new Error(`Timeout waiting for "${eventName}" event`);
      }),
    ]);
  }
}

const HelperPlugin = () => new PuppeteerExtraPluginHelper();

export default HelperPlugin;
