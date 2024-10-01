import type { IncomingMessage } from 'node:http';
import dedent from 'dedent';
import WebSocket from 'ws';

import { CodeSample, ProxyWebSocketRoute, WsHandler } from '@/router';
import {
  makeExternalUrl,
  parseSearchParams,
  parseUrlFromIncomingMessage,
  useTypedParsers,
  writeResponse,
} from '@/utils';
import { WSDefaultQuerySchema } from '@/schemas';
import { OPENAPI_TAGS, HttpStatus } from '@/constants';

const basicExample: CodeSample = {
  lang: 'TypeScript',
  label: 'Basic Example',
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

      await browser.disconnect();
    })();
  `,
};

const liveModeExample: CodeSample = {
  lang: 'TypeScript',
  label: 'Live Mode Example',
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

      // ... do something after the live mode is completed

      await browser.disconnect();
    })();
  `,
};

const keepAliveExample: CodeSample = {
  lang: 'TypeScript',
  label: 'Keep Alive Example',
  source: dedent`
    import puppeteer from 'puppeteer-core';

    (async () => {
      const browser = await puppeteer.connect({
        browserWSEndpoint: 'ws://localhost:3000',
      });

      const page = await browser.newPage();
      await page.goto('https://example.com', {
        waitUntil: 'domcontentloaded',
      });

      const title = await page.title();
      console.log(title);

      const connectUrl = await page.evaluate(() => {
        // @ts-ignore
        return window.keepAlive(90000);
      });

      // connectUrl = ws://localhost:3000/ws://localhost:3000/devtools/browser/77614ded-8ae8-4297-adc7-743a336bb52c

      await browser.disconnect();

      // Reconnect
      const browser2 = await puppeteer.connect({
        browserWSEndpoint: connectUrl,
      });

      const [currentPage] = await browser2.pages();
      console.log(await currentPage.title());

      await browser2.disconnect();
    })();
  `,
};

const recorderExample: CodeSample = {
  lang: 'TypeScript',
  label: 'Recorder Example',
  source: dedent`
    import puppeteer from 'puppeteer-core';

    (async () => {
      const browserWSURL = new URL('ws://localhost:3000');
      browserWSURL.searchParams.set('record', 'true');

      const browserWSEndpoint = browserWSURL.href;

      const browser = await puppeteer.connect({
        browserWSEndpoint,
      });

      const page = await browser.newPage();
      await page.goto('https://www.youtube.com/watch?v=KLuTLF3x9sA', {
        waitUntil: 'load',
      });

      await page.evaluate(() => {
        // @ts-ignore
        window.recorder.start();
      });

      await sleep(5000);

      await page.evaluate(() => {
        // @ts-ignore
        return window.recorder.stop();
      });

      await browser.disconnect();
    })();
  `,
};

export class IndexWsRoute extends ProxyWebSocketRoute {
  path = '/';
  swagger = {
    tags: [OPENAPI_TAGS.WS_APIS],
    servers: [
      {
        url: makeExternalUrl('ws'),
      },
    ],
    summary: this.path,
    description:
      'Launch and connect to Browser with a library like puppeteer or others that work over chrome-devtools-protocol.',
    request: {
      query: WSDefaultQuerySchema,
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
    'x-codeSamples': [basicExample, liveModeExample, keepAliveExample, recorderExample],
  };
  shouldUpgrade = (req: IncomingMessage) => {
    const url = parseUrlFromIncomingMessage(req);

    return url.pathname === this.path;
  };
  handler: WsHandler = async (req, socket, head) => {
    const { wsServer, browserManager } = this.context;

    const url = parseUrlFromIncomingMessage(req);

    const query = parseSearchParams(url.search);

    const queryValidation = useTypedParsers(WSDefaultQuerySchema).safeParse(query);

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
    const browser = await browserManager.requestBrowser(req, launchBrowserOptions);

    const browserWSEndpoint = browser.wsEndpoint();

    // try {
    //   await this.proxyWebSocket(req, socket, head, browser, browserWSEndpoint!);
    // } finally {
    //   this.logger.info(`WebSocket Request handler has finished.`);

    //   browserManager.complete(browser);
    // }

    const clientWS = new WebSocket(browserWSEndpoint!);

    wsServer.once('connection', (ws) => {
      this.logger.info(`WebSocket Server opened connection`);

      clientWS.on('message', (data: any) => {
        const message = Buffer.from(data).toString('utf-8');

        const payload = JSON.parse(message);

        if (payload.error) {
          if (payload.error.message === `'Foo.bar' wasn't found`) {
            // {"id":13,"result":{"executionContextId":3},"sessionId":"5F91AFC108FFE095CCDA2E3CFF5A3B06"}
            const data = {
              id: payload.id,
              result: {
                bar: 'Hello world',
              },
              sessionId: payload.sessionId,
            };
            const msg = JSON.stringify(data);
            return ws.send(Buffer.from(msg));
          }

          ws.send(data);
          // ws.emit('error', new Error(payload.error.message));
        }

        ws.send(data);
      });

      ws.on('message', (data: any) => {
        this.logger.info(`Received message from browser: ${data}`);

        const message = Buffer.from(data).toString('utf-8');

        this.logger.info(`Received payload from browser: ${message}`);

        const payload = JSON.parse(message);

        if (payload.method === 'Foo.bar') {
          console.log('Custom method Foo.bar is called');
        }
        return clientWS.send(message);
      });
    });

    wsServer.once('error', (err) => {
      this.logger.error(`WebSocket Server error`, err);

      clientWS.close();

      wsServer.close();
    });

    wsServer.once('close', () => {
      this.logger.info(`WebSocket Server closed`);
      clientWS.close();

      browserManager.complete(browser);
    });

    clientWS.once('open', () => {
      this.logger.info(`WebSocket connected to ${browserWSEndpoint}`);
      wsServer.handleUpgrade(req, socket, head, (ws) => {
        const close = async () => {
          this.logger.info('socket closed');

          browser.off('close', close);
          browser.process()?.off('close', close);
          socket.off('close', close);

          browserManager.complete(browser);
          // return resolve();
        };

        browser?.once('close', close);
        browser?.process()?.once('close', close);
        socket.once('close', close);

        wsServer.emit('connection', ws, req);
      });
    });
  };
}
