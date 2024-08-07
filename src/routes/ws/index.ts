import dedent from 'dedent';
import type { IncomingMessage } from 'node:http';

import { ProxyWebSocketRoute, WsHandler } from '@/router';
import {
  makeExternalUrl,
  parseSearchParams,
  parseUrlFromIncomingMessage,
  useTypedParsers,
  writeResponse,
} from '@/utils';
import { BooleanOrStringSchema, RequestDefaultQuerySchema } from '@/schemas';
import { OPENAPI_TAGS, HttpStatus } from '@/constants';

const RequestQuerySchema = RequestDefaultQuerySchema.extend({
  live: BooleanOrStringSchema.describe('Whether to launch the browser in live mode').optional(),
});

export class IndexWsRoute extends ProxyWebSocketRoute {
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
      query: RequestQuerySchema,
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
    'x-codeSamples': [
      {
        lang: 'JavaScript',
        label: 'Example',
        source: dedent`
          import puppeteer from 'puppeteer-core';

          (async () => {
            const browser = await puppeteer.connect({
              browserWSEndpoint: 'ws://localhost:3000',
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.goto('https://example.com', {
              waitUntil: 'domcontentloaded',
            });

            const title = await page.title();
            console.log(title);

            await browser.close();
          })();
        `,
      },
      {
        lang: 'TypeScript',
        label: 'Example with live mode',
        source: dedent`
          import puppeteer from 'puppeteer-core';

          (async () => {
            const browserWSURL = new URL('ws://localhost:3000');
            browserWSURL.searchParams.set('live', 'true');

            const browserWSEndpoint = browserWSURL.href;

            const browser = await puppeteer.connect({
              browserWSEndpoint,
            });

            const page = await browser.newPage();
            const liveURL = await page.evaluate(() => {
              return (window as any).liveURL();
            });

            // liveURL = http://localhost:3000/live?t=AB36EAB7B4523FA0304AF64CB661082A

            await new Promise((resolve) => page.exposeFunction('liveComplete', resolve));
          })();
        `,
      },
    ],
  };
  shouldUpgrade = (req: IncomingMessage) => {
    const url = parseUrlFromIncomingMessage(req);

    return url.pathname === this.path;
  };
  handler: WsHandler = async (req, socket, head) => {
    const { wsServer, puppeteerProvider, proxy } = this.context;

    const url = parseUrlFromIncomingMessage(req);

    const query = parseSearchParams(url.search);

    const queryValidation = useTypedParsers(RequestQuerySchema).safeParse(query);

    if (queryValidation.error) {
      const errorDetails = queryValidation.error.errors.map((error) => error.message).join('\n');

      return writeResponse(socket, HttpStatus.BAD_REQUEST, {
        message: `Bad Request: ${errorDetails}`,
      });
    }

    const { live: isLiveMode, ...queryOptions } = queryValidation.data;

    const launchBrowserOptions = Object.assign({}, queryOptions, {
      ws: isLiveMode && wsServer,
    });
    const browser = await puppeteerProvider.launchBrowser(req, launchBrowserOptions);

    const browserWSEndpoint = browser.wsEndpoint();

    return this.proxyWebSocket(req, socket, head, browser, browserWSEndpoint);
  };
}
