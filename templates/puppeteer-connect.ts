import { parentPort } from 'node:worker_threads';
import type { Page, BrowserContext } from 'puppeteer';
import puppeteer from 'puppeteer-extra';

type Context = Pick<BrowserContext, 'overridePermissions' | 'clearPermissionOverrides'>;

type HandlerArgument = {
  page: Page;
  ctx: Context;
};

parentPort!.on('message', async ({ browserWSEndpoint }) => {
  const browser = await puppeteer.connect({ browserWSEndpoint });

  const browserCtx = await browser.createBrowserContext();

  const ctx: Context = {
    clearPermissionOverrides: browserCtx.clearPermissionOverrides.bind(browserCtx),
    overridePermissions: browserCtx.overridePermissions.bind(browserCtx),
  };

  const page = await browserCtx.newPage();

  const handlerArgument: HandlerArgument = { page, ctx };

  const result = await exports.handler(handlerArgument);

  try {
    await page.close();
    await browserCtx.close();
    await browser.disconnect();
  } catch (err) {
    console.error(err);
  } finally {
    const proc = browser.process();
    if (proc) {
      proc.kill('SIGKILL');
    }
    parentPort!.postMessage(result);
  }
});
