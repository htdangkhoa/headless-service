import { Router } from 'pure-http';
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import prettier from 'prettier';

const prettierrcStr = fs.readFileSync('.prettierrc', 'utf8');
const prettierrc = JSON.parse(prettierrcStr);

import { PuppeteerProvider } from '@/puppeteer-provider';

const router = Router();

router.post('/run', async (req, res) => {
  const puppeteerProvider = req.app.get<PuppeteerProvider>('puppeteerProvider');

  const browser = await puppeteerProvider.getBrowser();
  const browserWSEndpoint = browser.wsEndpoint();

  /**
   * handle client side script
   */
  const sourceFromUser = Buffer.from(req.body).toString('utf8');

  const source = [
    "const { parentPort } = require('worker_threads');",
    sourceFromUser,
    `
      parentPort.on('message', async (...args) => {
        const result = await exports.handler(...args);
        parentPort.postMessage(result);
      });
    `,
  ].join('\n');

  const code = await prettier.format(source, { ...prettierrc, parser: 'babel' });

  console.log('===== script from client =====');
  console.log(code);
  console.log('===============================');

  const worker = new Worker(code, {
    eval: true,
    env: {
      NODE_ENV: 'SANDBOX',
    },
    resourceLimits: {
      maxOldGenerationSizeMb: 16,
      maxYoungGenerationSizeMb: 4,
      codeRangeSizeMb: 16,
    },
  });
  worker.postMessage({ browserWSEndpoint });

  worker.on('message', async (msg) => {
    await puppeteerProvider.launchBrowser();

    res.send({
      data: msg,
    });
  });

  worker.on('error', async (err) => {
    await puppeteerProvider.cleanup(browser, true);
    await puppeteerProvider.launchBrowser();

    res.status(500).send({
      message: err.message,
    });
  });
});

export default router;
