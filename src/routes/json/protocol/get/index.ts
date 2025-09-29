import dedent from 'dedent';
import type { Handler } from 'express';
import { z } from 'zod';

import { ProtocolSchema } from '@/cdp/devtools';
import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import { ResponseBodySchema as ResponseDefaultBodySchema } from '@/schemas';
import { writeResponse } from '@/utils';

export class JSONProtocolGetRoute extends ProxyHttpRoute {
  method = Method.GET;
  path = '/protocol';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`
      Returns a JSON payload that acts as a pass-through to the DevTools /json/version protocol in Browser.
    `,
    responses: {
      200: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: ProtocolSchema.extend({
              domains: z.array(z.unknown()),
            }),
          },
        },
      },
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: ResponseDefaultBodySchema.omit({ data: true }),
          },
        },
      },
    },
  };
  handler: Handler = async (req, res) => {
    const { browserManager } = this.context;

    const browser = await browserManager.requestBrowser(req);

    try {
      const jsonProtocol = await browser.getJSONProtocol();

      return writeResponse(res, HttpStatus.OK, {
        body: jsonProtocol!,
        skipValidateBody: true,
      });
    } catch (error) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: error as Error,
      });
    } finally {
      browser.close();
    }
  };
}
