import { IncomingMessage } from 'node:http';

import { ProxyWebSocketRoute, WsHandler } from '@/router';
import { makeExternalUrl, parseUrlFromIncomingMessage, writeResponse } from '@/utils';
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
    const { browserManager } = this.context;

    const url = parseUrlFromIncomingMessage(req);

    const [, browserId] = DEVTOOLS_PATH_REGEX.exec(url.pathname) || [];

    const browser = await browserManager.requestBrowser(req, { browserId });

    try {
      const browserWSEndpoint = browser.wsEndpoint();

      return this.proxyWebSocket(req, socket, head, browser, browserWSEndpoint!);
    } catch (error: any) {
      return writeResponse(socket, HttpStatus.LOGIN_TIMEOUT, {
        body: error,
        message: error.message,
      });
    } finally {
      this.logger.info(`WebSocket Request handler has finished.`);

      browserManager.complete(browser);
    }
  };
}
