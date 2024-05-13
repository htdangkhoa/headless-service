import { Router } from 'pure-http';
import { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import tsc from 'typescript';

import { PuppeteerProvider } from '@/puppeteer-provider';
import { env, makeExternalUrl } from '@/utils';
import { FunctionRunner } from '@/shared/function-runner';

declare global {
  interface Window {
    BrowserFunctionRunner: typeof FunctionRunner;
  }
}

const router = Router();

router.post('/function', async (req, res) => {
  const functionRequestUrl = makeExternalUrl('function');

  const puppeteerProvider = req.app.get<PuppeteerProvider>('puppeteerProvider');

  const browser = await puppeteerProvider.launchBrowser(req as IncomingMessage, {
    devtools: true,
  });
  const browserWSEndpoint = browser.wsEndpoint();
  const browserWSURL = new URL(browserWSEndpoint);

  let externalWSEndpoint = makeExternalUrl(browserWSURL.pathname);
  externalWSEndpoint.startsWith('https')
    ? (externalWSEndpoint = externalWSEndpoint.replace('https', 'wss'))
    : (externalWSEndpoint = externalWSEndpoint.replace('http', 'ws'));

  const functionIndexHTML = makeExternalUrl('function', 'index.html');

  const userCode = Buffer.from(req.body).toString('utf8');

  const { outputText: compiledCode } = tsc.transpileModule(userCode, {
    compilerOptions: {
      target: tsc.ScriptTarget.ESNext,
      module: tsc.ModuleKind.ESNext,
    },
  });

  const runtimeFunction = `${randomUUID()}.js`;

  const page = await browser.newPage();

  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const requestUrl = request.url();

    if (requestUrl.startsWith(functionRequestUrl)) {
      const filename = path.basename(requestUrl);

      if (filename === runtimeFunction) {
        return request.respond({
          body: compiledCode,
          contentType: 'application/javascript',
          status: 200,
        });
      }
    }

    return request.continue();
  });

  page.on('console', (event) => {
    console.log(`${event.type()}: ${event.text()}`);
  });

  await page.goto(functionIndexHTML, { waitUntil: 'networkidle2' });

  return page
    .evaluate(
      async (params) => {
        const { browserWSEndpoint, runtimeFunction } = params;

        const mod = await import('./' + runtimeFunction);

        let handler;

        if (typeof mod.default === 'function') {
          handler = mod.default;
        } else if (typeof mod.handler === 'function') {
          handler = mod.handler;
        } else {
          throw new Error('No default export or handler function found');
        }

        const runner = new window.BrowserFunctionRunner(browserWSEndpoint);

        return runner.start(handler);
      },
      {
        browserWSEndpoint: externalWSEndpoint,
        runtimeFunction,
      }
    )
    .then((result) => res.send({ data: result }))
    .catch((err) => res.send({ error: err.message, stack: err.stack }))
    .finally(async () => {
      await page.setRequestInterception(false);
      await puppeteerProvider.closeBrowser(browser);
    });
});

export default router;
