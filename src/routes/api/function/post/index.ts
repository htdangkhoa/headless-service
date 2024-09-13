import { Handler } from 'express';
import { z } from 'zod';
import dedent from 'dedent';

import { ProxyHttpRoute, Method } from '@/router';
import { RequestDefaultQuerySchema, ResponseBodySchema } from '@/schemas';
import { functionHandler, parseSearchParams, useTypedParsers, writeResponse } from '@/utils';
import { OPENAPI_TAGS, HttpStatus } from '@/constants';

const RequestFunctionBodySchema = z.string().describe('The user code to run');

export class FunctionPostRoute extends ProxyHttpRoute {
  method = Method.POST;
  path = '/function';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`
      A JSON or JavaScript content-type API for running puppeteer code in the browser's context.

      Headless Service sets up a blank page, injects your puppeteer code, and runs it.
      
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
    const { browserManager } = this.context;

    const query = parseSearchParams(req.query);

    const queryValidation = useTypedParsers(RequestDefaultQuerySchema).safeParse(query);

    if (queryValidation.error) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: queryValidation.error.errors,
      });
    }

    const browser = await browserManager.requestBrowser(req, queryValidation.data);
    const userCode = Buffer.from(req.body).toString('utf8');

    const handler = functionHandler(browser, this.logger);

    return handler(userCode)
      .then(({ result }) =>
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
        await browserManager.complete(browser);
      });
  };
}
