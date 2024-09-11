import { IncomingMessage } from 'node:http';

import { ProxyWebSocketRoute, WsHandler } from '@/router';
import {
  makeExternalUrl,
  parseSearchParams,
  parseUrlFromIncomingMessage,
  useTypedParsers,
  writeResponse,
} from '@/utils';
import { HEADLESS_PAGE_IDENTIFIER, HttpStatus, OPENAPI_TAGS } from '@/constants';
import { BrowserCDP } from '@/cdp';
import { BooleanOrStringSchema, WSDefaultQuerySchema } from '@/schemas';
import dedent from 'dedent';

// /devtools/page/9D8F0DE47A20F0181D65B251A6F59ACC
const DEVTOOLS_PATH_REGEX = /\/devtools\/page\/([A-Z0-9]{32})/;

export class DevtoolsPageWsRoute extends ProxyWebSocketRoute {
  path = '/devtools/page/:pageId';
  swagger = {
    tags: [OPENAPI_TAGS.WS_APIS],
    servers: [
      {
        url: makeExternalUrl('ws'),
      },
    ],
    summary: this.path,
    description: dedent`
      Connect to an existing page in Browser with a library like chrome-remote-interface or others that work the page websocketDebugger URL.
      
      You can get this unique URL by calling the /json/list API or by finding the page's unique ID from your library of choice
    `,
    request: {
      query: WSDefaultQuerySchema.extend({
        record: BooleanOrStringSchema.describe(
          'Record the page with audio. Work only with the page id is created by the API `/json/new`'
        ).optional(),
      }),
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

    const [, requestPageId] = DEVTOOLS_PATH_REGEX.exec(url.pathname) || [];

    let pageId = requestPageId;

    const query = parseSearchParams(url.search);

    const queryValidation = useTypedParsers(WSDefaultQuerySchema).safeParse(query);

    if (queryValidation.error) {
      const errorDetails = queryValidation.error.errors.map((error) => error.message).join('\n');

      return writeResponse(socket, HttpStatus.BAD_REQUEST, {
        message: `Bad Request: ${errorDetails}`,
      });
    }

    const options = queryValidation.data;

    let browser: BrowserCDP | null = null;

    if (pageId.startsWith(HEADLESS_PAGE_IDENTIFIER)) {
      browser = await browserManager.requestBrowser(req, options);
      const page = await browser.newPage();
      pageId = browserManager.getPageId(page);
    } else {
      browser = await browserManager.getBrowserByPageId(pageId);
    }

    if (!browser) {
      const error = new Error(`Could't locate browser for request "${url.pathname}"`);

      return writeResponse(socket, HttpStatus.LOGIN_TIMEOUT, {
        body: error,
        message: error.message,
      });
    }

    const browserWSEndpoint = browser.wsEndpoint();

    const { origin } = new URL(browserWSEndpoint!);

    const { href: pageWSEndpoint } = new URL(`/devtools/page/${pageId}`, origin);

    try {
      await this.proxyWebSocket(req, socket, head, browser, pageWSEndpoint);
    } finally {
      this.logger.info(`WebSocket Request handler has finished.`);

      browserManager.complete(browser);
    }
  };
}
