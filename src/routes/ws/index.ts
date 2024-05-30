import zu from 'zod_utilz';
import { StatusCodes } from 'http-status-codes';

import { WsRoute as Route, WsHandler } from '@/route-group';
import {
  RequestDefaultQuerySchema,
  makeExternalUrl,
  parseSearchParams,
  parseUrlFromIncomingMessage,
  writeResponse,
} from '@/utils';
import { OPENAPI_TAGS } from '@/constants';

export class WsRoute implements Route {
  path = '/';
  swagger = {
    tags: [OPENAPI_TAGS.WS_APIS],
    servers: [
      {
        url: makeExternalUrl().replace('http', 'ws'),
      },
    ],
    summary: this.path,
    description:
      'Launch and connect to Chromium with a library like puppeteer or others that work over chrome-devtools-protocol.',
    request: {
      query: RequestDefaultQuerySchema,
    },
    responses: {
      101: {
        description: 'Indicates successful WebSocket upgrade.',
      },
      400: {
        description: 'Bad request',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  };
  handler: WsHandler = async (req, socket, head, context) => {
    const { wsServer, puppeteerProvider, proxy } = context;

    const url = parseUrlFromIncomingMessage(req);

    const browserId = url.href.replace(url.search, '').split('/').pop();

    const query = parseSearchParams(url.search);

    const queryValidation = zu.useTypedParsers(RequestDefaultQuerySchema).safeParse(query);

    if (queryValidation.error) {
      const errorDetails = queryValidation.error.errors.map((error) => error.message).join('\n');

      return writeResponse(socket, StatusCodes.BAD_REQUEST, {
        message: `Bad Request: ${errorDetails}`,
      });
    }

    const browser = await puppeteerProvider.launchBrowser(req, {
      ...(queryValidation.data.launch ?? {}),
      ws: wsServer,
      browserId,
    });

    const browserWSEndpoint = browser.wsEndpoint();

    return new Promise<void>((resolve, reject) => {
      const close = async () => {
        console.log('socket closed');

        try {
          await puppeteerProvider.closeBrowser(browser);
        } catch (error) {
          console.warn('Error closing browser', error);
        }

        browser.off('close', close);
        browser.process()?.off('close', close);
        socket.off('close', close);
        return resolve();
      };

      browser?.once('close', close);
      browser?.process()?.once('close', close);
      socket.once('close', close);

      req.url = '';

      // Delete headers known to cause issues
      delete req.headers.origin;

      proxy.ws(
        req,
        socket,
        head,
        {
          target: browserWSEndpoint,
          changeOrigin: true,
        },
        (error) => {
          puppeteerProvider.closeBrowser(browser);
          return reject(error);
        }
      );
    });
  };
}
