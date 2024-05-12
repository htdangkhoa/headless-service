import { IncomingMessage } from 'node:http';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'pure-http';
import tsc from 'typescript';

import { PuppeteerProvider } from '@/puppeteer-provider';

const router = Router();

router.post('/execute', async (req, res) => {
  const puppeteerProvider = req.app.get<PuppeteerProvider>('puppeteerProvider');

  const browser = await puppeteerProvider.launchBrowser(req as IncomingMessage);
  const browserWSEndpoint = browser.wsEndpoint();

  /**
   * handle client side script
   */
  const userCode = Buffer.from(req.body).toString('utf8');

  const templateFile = path.resolve(process.cwd(), 'templates/puppeteer-connect.ts');
  const masterCode = fs.readFileSync(templateFile, 'utf8');

  const mergedCode = [userCode, masterCode].join('\n');

  const { outputText: compiledCode } = tsc.transpileModule(mergedCode, {
    compilerOptions: {
      module: tsc.ModuleKind.CommonJS,
      target: tsc.ScriptTarget.ESNext,
    },
  });

  console.log('===== Code compiled =====');
  console.log(compiledCode);
  console.log('=========================');

  const worker = new Worker(compiledCode, {
    eval: true,
    env: {
      NODE_ENV: 'SANDBOX',
    },
    resourceLimits: {
      maxOldGenerationSizeMb: 128,
      maxYoungGenerationSizeMb: 32,
      codeRangeSizeMb: 16,
    },
  });
  worker.postMessage({ browserWSEndpoint });

  worker.on('message', async (msg) => {
    worker.emit('exit', 0);

    return res.send({ data: msg });
  });

  worker.once('error', async (err) => {
    worker.emit('exit', 1);

    return res.status(500).send({
      message: err.message,
      stack: err.stack,
    });
  });

  worker.once('exit', async (code) => {
    await puppeteerProvider.closeBrowser(browser);

    worker.removeAllListeners();

    await worker.terminate();
  });
});

export default router;
