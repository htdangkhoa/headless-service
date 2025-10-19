import dedent from 'dedent';
import type { Handler } from 'express';
import { z } from 'zod';

import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import { ResponseBodySchema as ResponseDefaultBodySchema } from '@/schemas';
import { writeResponse } from '@/utils';

const DevToolsJSONSchema = z.object({
  description: z.string().describe("The description of the target. Generally the page's title."),
  devtoolsFrontendURL: z.string().describe('The frontend URL for the target.'),
  id: z.string().describe('The unique identifier of the target.'),
  title: z.string().describe('The title of the target.'),
  type: z.literal('page').or(z.literal('background_page')).describe('The type of the target.'),
  url: z.string().describe('The URL the target is pointing to.'),
  webSocketDebuggerURL: z.string().describe('The WebSocket debugger URL for the target.'),
});

const ResponseBodySchema = z.array(DevToolsJSONSchema).describe('The list of targets');

export class JSONListGetRoute extends ProxyHttpRoute {
  method = Method.GET;
  path = '/list';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`
      Returns a JSON payload that acts as a pass-through to the DevTools /json/list HTTP API in Browser.
      
      Headless Service crafts this payload so that remote clients can connect to the underlying "webSocketDebuggerURL" properly.
    `,
    responses: {
      200: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: ResponseBodySchema,
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

    const list = await browserManager.getJSONList();

    return writeResponse(res, HttpStatus.OK, {
      body: list,
      skipValidateBody: true,
    });
  };
}
