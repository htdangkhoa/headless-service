import { Handler } from 'pure-http';
import tsc from 'typescript';
import { randomUUID } from 'node:crypto';
import { HTTPRequest, HTTPResponse, ConsoleMessage } from 'puppeteer';
import path from 'node:path';
import { IncomingMessage } from 'node:http';
import { z } from 'zod';
import dedent from 'dedent';

import { Method, Route } from '@/router';
import { makeExternalUrl } from '@/utils';
import { PuppeteerProvider } from '@/puppeteer-provider';
import { ICodeRunner, FunctionRunner } from '@/shared/function-runner';

interface IPageFunctionArguments {
  browserWSEndpoint: string;
  runtimeFunction: string;
}

declare global {
  interface Window {
    BrowserFunctionRunner: typeof FunctionRunner;
  }
}

export class FunctionPostRoute implements Route {
  method = Method.POST;
  path = '/function';
  request = {
    body: {
      description: 'The user code to run',
      content: {
        'application/javascript': {
          schema: z.string(),
          example: dedent`export default async function ({ page }: { page: Page }) {
            await page.goto('https://example.com', {
              waitUntil: 'domcontentloaded',
            });
            const title = await page.title();
            return { title };
          };`,
        },
      },
      required: true,
    },
  };
  responses = {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            data: z.unknown(),
          }),
        },
      },
    },
    500: {
      description: 'Internal Server Error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            stack: z.string(),
          }),
        },
      },
    },
  };
  private handler: Handler = async (req, res) => {
    const functionRequestUrl = makeExternalUrl('function');

    const puppeteerProvider = req.app.get<PuppeteerProvider>('puppeteerProvider');

    const browser = await puppeteerProvider.launchBrowser(req as IncomingMessage, {
      devtools: true,
    });

    const browserWSEndpoint = browser.wsEndpoint();
    const browserWebSocketURL = new URL(browserWSEndpoint);

    let externalWSEndpoint = makeExternalUrl(browserWebSocketURL.pathname);
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

    const onRequest = (request: HTTPRequest) => {
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
    };

    const onResponse = (response: HTTPResponse) => {
      if (!response.ok()) {
        const requestUrl = response.url();
        console.error(`Received a non-200 response for request ${requestUrl}`);
      }
    };

    const onConsole = (message: ConsoleMessage) => {
      console.log(`${message.type()}: ${message.text()}`);
    };

    page.on('request', onRequest);
    page.on('response', onResponse);
    page.on('console', onConsole);

    await page.goto(functionIndexHTML);

    return page
      .evaluate(
        async (args: IPageFunctionArguments) => {
          const { browserWSEndpoint, runtimeFunction } = args;

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

          return runner.start(handler as ICodeRunner);
        },
        {
          browserWSEndpoint: externalWSEndpoint,
          runtimeFunction,
        } as IPageFunctionArguments
      )
      .then((result) => res.send({ data: result }))
      .catch((err) => res.status(500).send({ error: err.message, stack: err.stack }))
      .finally(async () => {
        await page.setRequestInterception(false);
        await puppeteerProvider.closeBrowser(browser);
      });
  };
  handlers = [this.handler.bind(this)];
}
