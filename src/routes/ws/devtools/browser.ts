import { IncomingMessage } from 'node:http';

import { ProxyWebSocketRoute, WsHandler } from '@/router';
import {
  getZodErrorMessages,
  makeExternalUrl,
  parseSearchParams,
  parseUrlFromIncomingMessage,
  useTypedParsers,
  writeResponse,
} from '@/utils';
import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { WSDefaultQuerySchema } from '@/schemas';
import dedent from 'dedent';

// /devtools/browser/00000000-0000-0000-0000-000000000000
const DEVTOOLS_PATH_REGEX = /\/devtools\/browser\/([a-f0-9-]+)$/;

export class DevtoolsBrowserWsRoute extends ProxyWebSocketRoute {
  path = '/devtools/browser/:browserId';
  swagger = {
    tags: [OPENAPI_TAGS.WS_APIS],
    servers: [
      {
        url: makeExternalUrl('ws'),
      },
    ],
    summary: this.path,
    description: dedent`
      Connect to an already-running Browser process with a library like puppeteer, or others, that work over chrome-devtools-protocol.
      
      Browser must already be launched in order to not return a 404.
    `,
    request: {
      query: WSDefaultQuerySchema,
    },
    responses: {},
  };
  shouldUpgrade = (req: IncomingMessage) => {
    const url = parseUrlFromIncomingMessage(req);

    return DEVTOOLS_PATH_REGEX.test(url.pathname);
  };
  handler: WsHandler = async (req, socket, head) => {
    const { wsServer, browserManager } = this.context;

    const url = parseUrlFromIncomingMessage(req);

    const [, browserId] = DEVTOOLS_PATH_REGEX.exec(url.pathname) || [];

    const query = parseSearchParams(url.search);

    const queryValidation = useTypedParsers(WSDefaultQuerySchema).safeParse(query);

    if (queryValidation.error) {
      const errorDetails = getZodErrorMessages(queryValidation.error);

      return writeResponse(socket, HttpStatus.BAD_REQUEST, {
        message: `Bad Request: ${errorDetails}`,
      });
    }

    const queryOptions = queryValidation.data;

    const launchBrowserOptions = Object.assign({}, queryOptions, {
      ws: wsServer,
      browserId,
    });

    const browser = await browserManager.requestBrowser(req, launchBrowserOptions);

    const browserWSEndpoint = browser.wsEndpoint();

    return this.proxyWebSocket(req, socket, head, browser, browserWSEndpoint!);
  };
}
