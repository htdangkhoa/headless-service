import path from 'node:path';
import { createServer, type Server } from 'node:http';
import express, { ErrorRequestHandler } from 'express';
import timeout from 'connect-timeout';
import consolidate from 'consolidate';
import cors from 'cors';
import HttpProxy from 'http-proxy';
import { WebSocketServer } from 'ws';
import dedent from 'dedent';

import {
  FunctionPostRoute,
  PdfPostRoute,
  PerformancePostRoute,
  ScrapePostRoute,
  ScreenshotPostRoute,
  JSONGetRoute,
  JSONListGetRoute,
  JSONNewPutRoute,
  JSONProtocolGetRoute,
  JSONVersionGetRoute,
  DevtoolsBrowserWsRoute,
  DevtoolsPageWsRoute,
  LiveIndexWsRoute,
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

  private server: Server | null = createServer(this.app);

  private proxy: HttpProxy | null = HttpProxy.createProxyServer({});

  private wsServer = new WebSocketServer({ noServer: true });

  private browserManager = new BrowserManager();

  private headlessServerContext = {
    browserManager: this.browserManager,
    proxy: this.proxy!,
  };

  private headlessServerWebSocketContext = {
    ...this.headlessServerContext,
    wsServer: this.wsServer,
  };

  private apiGroup: Group = new Group(
    [FunctionPostRoute, PerformancePostRoute, ScreenshotPostRoute, PdfPostRoute, ScrapePostRoute],
    this.app,
    this.headlessServerContext,
    '/api'
  );

  private jsonGroup: Group = new Group(
    [JSONGetRoute, JSONListGetRoute, JSONNewPutRoute, JSONVersionGetRoute, JSONProtocolGetRoute],
    this.app,
    this.headlessServerContext,
    '/json'
  );

  private wsGroup: Group = new Group(
    [DevtoolsBrowserWsRoute, DevtoolsPageWsRoute, LiveIndexWsRoute, IndexWsRoute],
    this.server!,
    this.headlessServerWebSocketContext,
    '/'
  );

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
  }

  async start() {
    // Generate OpenAPI documentation
    this.openApi.generateDocument({
      jsonFileName: path.resolve(process.cwd(), 'public', 'docs', 'swagger.json'),
      title: 'Headless Server',
      version: '1.0.0',
      servers: [{ url: makeExternalUrl('http') }],
    });

    this.server!.timeout = 0;
    this.server!.keepAliveTimeout = 0;

    const { host, port } = this.options;

    this.server!.listen(port, host, () => {
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

  private async shutdownServer() {
    await new Promise((resolve) => this.server!.close(resolve));
    this.server?.removeAllListeners();
    this.server = null;
  }

  private async shutdownProxy() {
    await new Promise<void>((resolve) => this.proxy!.close(resolve));
    this.proxy?.removeAllListeners();
    this.proxy = null;
  }

  async shutdownRouteGroups() {
    await Promise.all([
      [this.apiGroup, this.jsonGroup, this.wsGroup].map((group) => group.shutdown()),
    ]);
  }

  async shutdownBrowserManager() {
    await this.browserManager.shutdown();
  }

  async stop() {
    await Promise.all([
      this.shutdownServer(),
      this.shutdownProxy(),
      this.shutdownBrowserManager(),
      this.shutdownRouteGroups(),
    ]);
  }
}
