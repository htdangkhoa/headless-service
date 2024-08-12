import { Handler } from 'express';
import tsc from 'typescript';
import { randomUUID } from 'node:crypto';
import { HTTPRequest, HTTPResponse, ConsoleMessage } from 'puppeteer';
import path from 'node:path';
import { IncomingMessage } from 'node:http';
import { z } from 'zod';
import dedent from 'dedent';

import { ProxyHttpRoute, Method } from '@/router';
import { RequestDefaultQuerySchema, ResponseBodySchema } from '@/schemas';
import { makeExternalUrl, parseSearchParams, useTypedParsers, writeResponse } from '@/utils';
import { OPENAPI_TAGS, HttpStatus } from '@/constants';
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

const RequestFunctionBodySchema = z.string().describe('The user code to run');

export class FunctionPostRoute extends ProxyHttpRoute {
  method = Method.POST;
  path = '/function';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`
      A JSON or JavaScript content-type API for running puppeteer code in the browser's context.
      Browserless sets up a blank page, injects your puppeteer code, and runs it.
      You can optionally load external libraries via the "import" module that are meant for browser usage. Values returned from the function are checked and an appropriate content-type and response is sent back to your HTTP call.
    `,
    request: {
      query: RequestDefaultQuerySchema,
      body: {
        content: {
          'application/javascript': {
            schema: RequestFunctionBodySchema,
            example: dedent`
              export default async function ({ page }: { page: Page }) {
                await page.goto('https://example.com', {
                  waitUntil: 'domcontentloaded',
                });
                const title = await page.title();
                return { title };
              };
            `,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ errors: true }),
          },
        },
      },
      400: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ data: true }),
          },
        },
      },
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ data: true }),
          },
        },
      },
    },
  };
  handler: Handler = async (req, res) => {
    const query = parseSearchParams(req.query);

    const queryValidation = useTypedParsers(RequestDefaultQuerySchema).safeParse(query);

    if (queryValidation.error) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: queryValidation.error.errors,
      });
    }

    const functionRequestUrl = makeExternalUrl('http', 'function');

    const puppeteerProvider = req.app.get('puppeteerProvider') as PuppeteerProvider;

    const browser = await puppeteerProvider.launchBrowser(
      req as IncomingMessage,
      queryValidation.data
    );

    const browserWSEndpoint = browser.wsEndpoint();
    const browserWebSocketURL = new URL(browserWSEndpoint);

    const externalWSEndpoint = makeExternalUrl('ws', browserWebSocketURL.pathname);

    const functionIndexHTML = makeExternalUrl('http', 'function', 'index.html');

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
      .then((result) =>
        writeResponse(res, HttpStatus.OK, {
          body: { data: result },
        })
      )
      .catch((err) =>
        writeResponse(res, HttpStatus.INTERNAL_SERVER_ERROR, {
          body: err,
        })
      )
      .finally(async () => {
        await page.setRequestInterception(false);
        await puppeteerProvider.complete(browser);
      });
  };
}
