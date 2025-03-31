import type { Handler } from 'express';
import dedent from 'dedent';
import z from 'zod';
import { head } from 'lodash-es';

import { Method, ProxyHttpRoute } from '@/router';
import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { ResponseBodySchema as ResponseDefaultBodySchema } from '@/schemas';
import { generatePageId, makeExternalUrl, useTypedParsers, writeResponse } from '@/utils';

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
    summary: `${this.path}?{url}`,
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
    const openUrl = head(Object.keys(req.query));

    const externalWSAddress = makeExternalUrl('ws');

    const pageId = generatePageId();

    let devtoolsPath = `/devtools/page/${pageId}`;
    if (openUrl) {
      devtoolsPath += `?${openUrl}`;
    }
    const devtoolsUrl = new URL(devtoolsPath, externalWSAddress);

    const { href } = devtoolsUrl;

    const devtoolsUrlSearchParams = href.replace(/\:\/\//, '=');

    const body: any = {
      description: '',
      devtoolsFrontendUrl: makeExternalUrl(
        'http',
        `/devtools/inspector.html?${devtoolsUrlSearchParams}`
      ),
      id: pageId,
      title: 'New Tab',
      type: 'page',
      url: openUrl ?? 'about:blank',
      webSocketDebuggerUrl: href,
    };

    return writeResponse(res, HttpStatus.OK, {
      body,
      skipValidateBody: true,
    });
  };
}
