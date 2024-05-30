import path from 'node:path';
import { IncomingMessage, createServer } from 'node:http';
import { Socket } from 'node:net';
import express, { ErrorRequestHandler } from 'express';
import timeout from 'connect-timeout';
import consolidate from 'consolidate';
import cors from 'cors';
import httpProxy from 'http-proxy';
import { WebSocketServer } from 'ws';
import { StatusCodes } from 'http-status-codes';
import { zu } from 'zod_utilz';

import { PuppeteerProvider } from '@/puppeteer-provider';
import { FunctionPostRoute, PerformancePostRoute } from '@/routes';
import {
  RequestDefaultQuerySchema,
  makeExternalUrl,
  parseSearchParams,
  parseUrlFromIncomingMessage,
  writeResponse,
} from '@/utils';
import { RouteGroup } from '@/route-group';
import { OpenAPI } from '@/openapi';

export interface HeadlessServerOptions {
  port?: number;
  host?: string;
}

const publicDir = path.resolve(process.cwd(), 'public');

export class HeadlessServer {
  private options: HeadlessServerOptions;

  private app = express();

  private server = createServer(this.app);

  private proxy = httpProxy.createProxyServer({});

  private puppeteerProvider = new PuppeteerProvider();

  private apiGroup: RouteGroup = new RouteGroup(this.app, '/api');

  private openApi = new OpenAPI([this.apiGroup]);

  private wsServer = new WebSocketServer({ noServer: true });

  constructor(options: HeadlessServerOptions) {
    this.options = options;

    // Add puppeteer provider as a variable into the app settings
    this.app.set('puppeteerProvider', this.puppeteerProvider);

    // Set up views
    this.app.set('views', publicDir);
    this.app.engine('html', consolidate.mustache);
    this.app.set('view engine', 'html');

    // Middleware
    this.app.use(express.static(publicDir));
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.raw({ type: 'application/javascript' }));
    this.app.use(timeout('30s'));

    // API Routes
    this.apiGroup.registerRoute(FunctionPostRoute);
    this.apiGroup.registerRoute(PerformancePostRoute);

    // Error handling
    this.app.use(<ErrorRequestHandler>((err, _req, _res, next) => {
      console.error(err);
      return next(err);
    }));
    this.app.use(<ErrorRequestHandler>((err, req, res, next) => {
      if (req.timedout)
        return writeResponse(res, StatusCodes.REQUEST_TIMEOUT, {
          body: new Error('Request Timeout'),
        });
      if (req.xhr)
        return writeResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, {
          body: new Error('Something went wrong'),
        });
      return writeResponse(res, StatusCodes.INTERNAL_SERVER_ERROR, {
        body: err,
      });
    }));
  }

  async onUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    const url = parseUrlFromIncomingMessage(req);

    // Ex: /live
    if (url.pathname !== '/') {
      return this.wsServer.handleUpgrade(req, socket, head, (ws) => {
        this.wsServer.emit('connection', ws, req);
      });
    }

    const browserId = url.href.replace(url.search, '').split('/').pop();

    const query = parseSearchParams(url.search);

    const queryValidation = zu.useTypedParsers(RequestDefaultQuerySchema).safeParse(query);

    if (queryValidation.error) {
      const errorDetails = queryValidation.error.errors.map((error) => error.message).join('\n');

      return writeResponse(socket, StatusCodes.BAD_REQUEST, {
        message: `Bad Request: ${errorDetails}`,
      });
    }

    const browser = await this.puppeteerProvider.launchBrowser(req, {
      ...(queryValidation.data.launch ?? {}),
      ws: this.wsServer,
      browserId,
    });

    const browserWSEndpoint = browser.wsEndpoint();

    return new Promise<void>((resolve, reject) => {
      const close = async () => {
        console.log('socket closed');

        try {
          await this.puppeteerProvider.closeBrowser(browser);
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

      this.proxy.ws(
        req,
        socket,
        head,
        {
          target: browserWSEndpoint,
          changeOrigin: true,
        },
        (error) => {
          this.puppeteerProvider.closeBrowser(browser);
          return reject(error);
        }
      );
    });
  }

  async start() {
    // Generate OpenAPI documentation
    this.openApi.generateDocument({
      jsonFileName: path.resolve(process.cwd(), 'public', 'docs', 'swagger.json'),
      title: 'Headless Server',
      version: '1.0.0',
      servers: [{ url: makeExternalUrl() }],
    });

    this.server.on('upgrade', this.onUpgrade.bind(this));

    this.server.timeout = 0;
    this.server.keepAliveTimeout = 0;

    const { host, port } = this.options;

    this.server.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}`);
      console.log(`WS Proxy running at ws://${host}:${port}`);
    });
  }

  async close() {
    process.removeAllListeners();
    this.proxy.removeAllListeners();

    await this.puppeteerProvider.close();

    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      return process.exit(1);
    }, 5000);

    return this.server.close((err) => {
      if (err) {
        console.error(err);
        return process.exit(1);
      }

      console.log('Server closed');
      return process.exit(0);
    });
  }
}
