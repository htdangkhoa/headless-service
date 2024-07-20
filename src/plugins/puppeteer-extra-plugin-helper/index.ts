import { sleep } from '@/utils';
import { Page } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';

const DEFAULT_TIMEOUT = 30000;

export class PuppeteerExtraPluginHelper extends PuppeteerExtraPlugin {
  get name(): string {
    return 'helper';
  }

  async onPageCreated(page: Page): Promise<void> {
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
