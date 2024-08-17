import type { Handler } from 'express';
import * as path from 'node:path';
import dedent from 'dedent';
import z from 'zod';

import { Method, ProxyHttpRoute } from '@/router';
import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { ResponseBodySchema as ResponseDefaultBodySchema } from '@/schemas';
import { makeExternalUrl, writeResponse } from '@/utils';
import { generatePageId } from '@/utils/puppeteer';

const DevToolsJSONSchema = z.object({
  description: z.string().describe("The description of the target. Generally the page's title."),
  devtoolsFrontendUrl: z.string().describe('The frontend URL for the target.'),
  id: z.string().describe('The unique identifier of the target.'),
  title: z.string().describe('The title of the target.'),
  type: z.literal('page').or(z.literal('background_page')).describe('The type of the target.'),
  url: z.string().describe('The URL the target is pointing to.'),
  webSocketDebuggerUrl: z.string().describe('The WebSocket debugger URL for the target.'),
});

export class JSONNewPutRoute extends ProxyHttpRoute {
  method = Method.PUT;
  path = '/new';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`
      Returns a JSON payload that acts as a pass-through to the DevTools /json/new HTTP API in Browser.
      
      Headless Service mocks this payload so that remote clients can connect to the underlying \`webSocketDebuggerUrl\` which will cause Headless Service to start the browser and proxy that request into a blank page.
    `,
    responses: {
      200: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: DevToolsJSONSchema,
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
    const externalWSAddress = makeExternalUrl('ws');

    const pageId = generatePageId();

    const { protocol, host, pathname, href } = new URL(
      `/devtools/page/${pageId}`,
      externalWSAddress
    );

    const param = protocol.replace(':', '');
    const value = path.join(host, pathname);

    const body: any = {
      description: '',
      devtoolsFrontendUrl: makeExternalUrl('http', `/devtools/inspector.html?${param}=${value}`),
      id: pageId,
      title: 'New Tab',
      type: 'page',
      url: 'about:blank',
      webSocketDebuggerUrl: href,
    };

    return writeResponse(res, HttpStatus.OK, {
      body,
      skipValidateBody: true,
    });
  };
}
