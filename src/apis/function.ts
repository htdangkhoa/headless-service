import { Router } from 'pure-http';
import { IncomingMessage } from 'node:http';

import { PuppeteerProvider } from '@/puppeteer-provider';
import { env } from '@/utils';
import { FunctionRunner } from '@/shared/function-runner';

declare global {
  interface Window {
    BrowserFunctionRunner: typeof FunctionRunner;
  }
}

const router = Router();

router.post('/function', async (req, res) => {
  const puppeteerProvider = req.app.get<PuppeteerProvider>('puppeteerProvider');

  const browser = await puppeteerProvider.launchBrowser(req as IncomingMessage, {
    devtools: true,
  });
  const browserWSEndpoint = browser.wsEndpoint();
  const browserWSURL = new URL(browserWSEndpoint);

  const externalAddress = env('EXTERNAL_ADDRESS')!;
  const externalAddressURL = new URL(externalAddress);

  const externalWSURL = new URL(browserWSURL.pathname, externalAddressURL);
  const externalWSEndpoint = externalWSURL.toString().replace(externalWSURL.protocol, 'ws:');

  const functionIndexHTML = `${externalAddress}/function/index.html`;

  const page = await browser.newPage();
  await page.goto(functionIndexHTML, { waitUntil: 'networkidle2' });

  const result = await page.evaluate(
    async (params) => {
      const { browserWSEndpoint } = params;

      const runner = new window.BrowserFunctionRunner();

      return runner.start(browserWSEndpoint);
    },
    {
      browserWSEndpoint: externalWSEndpoint,
    }
  );

  res.send({ data: result });
});

export default router;
