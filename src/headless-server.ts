import path from 'node:path';
import { createServer } from 'node:http';
import express, { ErrorRequestHandler } from 'express';
import timeout from 'connect-timeout';
import consolidate from 'consolidate';
import cors from 'cors';
import httpProxy from 'http-proxy';
import { WebSocketServer } from 'ws';
import dedent from 'dedent';

import {
  FunctionPostRoute,
  PdfPostRoute,
  PerformancePostRoute,
  ScrapePostRoute,
  ScreenshotPostRoute,
  JSONListGetRoute,
  JSONNewPutRoute,
  JSONProtocolGetRoute,
  JSONVersionGetRoute,
  DevtoolsBrowserWsRoute,
  DevtoolsPageWsRoute,
  IndexWsRoute,
} from '@/routes';
import { makeExternalUrl, writeResponse } from '@/utils';
import { Group } from '@/router';
import { OpenAPI } from '@/openapi';
import { HttpStatus } from '@/constants';
import { BrowserManager } from './cdp';

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

  private wsServer = new WebSocketServer({ noServer: true });

  private browserManager = new BrowserManager();

  private headlessServerContext = {
    browserManager: this.browserManager,
    proxy: this.proxy,
  };

  private headlessServerWebSocketContext = {
    ...this.headlessServerContext,
    wsServer: this.wsServer,
  };

  private apiGroup: Group = new Group(this.app, this.headlessServerContext, '/api');

  private jsonGroup: Group = new Group(this.app, this.headlessServerContext, '/json');

  private wsGroup: Group = new Group(this.server, this.headlessServerWebSocketContext, '/');

  private openApi = new OpenAPI([this.apiGroup, this.jsonGroup, this.wsGroup]);

  constructor(options: HeadlessServerOptions) {
    this.options = options;

    // Set up views
    this.app.set('views', publicDir);
    this.app.engine('html', consolidate.mustache);
    this.app.set('view engine', 'html');

    // Middleware
    this.app.use(express.static(publicDir));
    this.app.use(cors({ origin: '*' }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.raw({ type: 'application/javascript' }));
    this.app.use(timeout('30s'));

    // API Routes
    this.apiGroup.registerRoutes([
      FunctionPostRoute,
      PerformancePostRoute,
      ScreenshotPostRoute,
      PdfPostRoute,
      ScrapePostRoute,
    ]);

    // JSON Routes
    this.jsonGroup.registerRoutes([
      JSONListGetRoute,
      JSONNewPutRoute,
      JSONVersionGetRoute,
      JSONProtocolGetRoute,
    ]);

    // Error handling
    this.app.use(<ErrorRequestHandler>((err, _req, _res, next) => {
      console.error(err);
      return next(err);
    }));
    this.app.use(<ErrorRequestHandler>((err, req, res, next) => {
      if (req.timedout)
        return writeResponse(res, HttpStatus.REQUEST_TIMEOUT, {
          body: new Error('Request Timeout'),
        });
      if (req.xhr)
        return writeResponse(res, HttpStatus.INTERNAL_SERVER_ERROR, {
          body: new Error('Something went wrong'),
        });
      return writeResponse(res, HttpStatus.INTERNAL_SERVER_ERROR, {
        body: err,
      });
    }));

    this.wsGroup.registerRoutes([DevtoolsBrowserWsRoute, DevtoolsPageWsRoute, IndexWsRoute]);
  }

  async start() {
    // Generate OpenAPI documentation
    this.openApi.generateDocument({
      jsonFileName: path.resolve(process.cwd(), 'public', 'docs', 'swagger.json'),
      title: 'Headless Server',
      version: '1.0.0',
      servers: [{ url: makeExternalUrl('http') }],
    });

    this.server.timeout = 0;
    this.server.keepAliveTimeout = 0;

    const { host, port } = this.options;

    this.server.listen(port, host, () => {
      const baseUrl = makeExternalUrl('http');
      const wsUrl = makeExternalUrl('ws');
      const docsLink = makeExternalUrl('http', 'docs');
      const info = dedent`
      --------------------------------------------
      | Host:           ${baseUrl}
      | WS Proxy:       ${wsUrl}
      | Documentation:  ${docsLink}
      --------------------------------------------
      `;
      console.log(info);
    });
  }

  async close() {
    process.removeAllListeners();
    this.proxy.removeAllListeners();

    await this.browserManager.shutdown();

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
