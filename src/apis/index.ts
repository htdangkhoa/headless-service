import { Router } from 'express';
import { Worker } from 'node:worker_threads';

import { PuppeteerProvider } from '@/puppeteer-provider';

const router = Router();

router.post('/run', async (req, res) => {
  const puppeteerProvider = req.app.get('puppeteerProvider') as PuppeteerProvider;

  const browser = await puppeteerProvider.getBrowser();
  const browserWSEndpoint = browser.wsEndpoint();

  /**
   * handle client side script
   */
  const content = Buffer.from(req.body).toString('utf8');

  const workerString = [
    "const { parentPort } = require('worker_threads');",
    content,
    `parentPort.on('message', async (...args) => {
      const result = await exports.handler(...args);
      parentPort.postMessage(result);
    });`,
  ].join('\n');

  console.log('===== script from client =====');
  console.log(workerString);
  console.log('===============================');

  const worker = new Worker(workerString, {
    eval: true,
    env: {
      NODE_ENV: 'SANDBOX',
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
