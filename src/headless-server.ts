import path from 'node:path';
import { createServer } from 'node:http';
import express, { ErrorRequestHandler } from 'express';
import timeout from 'connect-timeout';
import consolidate from 'consolidate';
import cors from 'cors';
import httpProxy from 'http-proxy';
import { WebSocketServer } from 'ws';
import { StatusCodes } from 'http-status-codes';

import { PuppeteerProvider } from '@/puppeteer-provider';
import { FunctionPostRoute, PerformancePostRoute, WsRoute } from '@/routes';
import { makeExternalUrl, writeResponse } from '@/utils';
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

  private wsServer = new WebSocketServer({ noServer: true });

  private apiGroup: RouteGroup = new RouteGroup(this.app, '/api');

  private wsGroup: RouteGroup = new RouteGroup(this.server, '/', {
    wsServer: this.wsServer,
    puppeteerProvider: this.puppeteerProvider,
    proxy: this.proxy,
  });

  private openApi = new OpenAPI([this.apiGroup, this.wsGroup]);

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

    this.wsGroup.registerRoute(WsRoute);
  }

  async start() {
    // Generate OpenAPI documentation
    this.openApi.generateDocument({
      jsonFileName: path.resolve(process.cwd(), 'public', 'docs', 'swagger.json'),
      title: 'Headless Server',
      version: '1.0.0',
      servers: [{ url: makeExternalUrl() }],
    });

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
