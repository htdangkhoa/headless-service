import dedent from 'dedent';
import type { Handler } from 'express';
import { z } from 'zod';

import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import { ResponseBodySchema as ResponseDefaultBodySchema } from '@/schemas';
import { writeResponse } from '@/utils';

const DevToolsVersionSchema = z.object({
  Browser: z.string().describe('The browser name.'),
  'Protocol-Version': z.string().describe('The protocol version.'),
  'User-Agent': z.string().describe('The user agent.'),
  'V8-Version': z.string().describe('The V8 version.'),
  'WebKit-Version': z.string().describe('The WebKit version.'),
  webSocketDebuggerUrl: z.string().describe('The WebSocket debugger URL for the target.'),
  'Debugger-Version': z.string().describe('The debugger version.'),
});

export class JSONVersionGetRoute extends ProxyHttpRoute {
  method = Method.GET;
  path = '/version';
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
            schema: DevToolsVersionSchema,
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

    const meta = await browserManager.getJSONVersion();

    return writeResponse(res, HttpStatus.OK, {
      body: meta,
      skipValidateBody: true,
    });
  };
}
