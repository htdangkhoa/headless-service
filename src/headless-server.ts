import path from 'node:path';
import { createServer, type Server } from 'node:http';
import express, { ErrorRequestHandler } from 'express';
import timeout from 'connect-timeout';
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
  JSONActivateGetRoute,
  JSONProtocolGetRoute,
  JSONVersionGetRoute,
  DevtoolsBrowserWsRoute,
  DevtoolsPageWsRoute,
  LiveIndexWsRoute,
  IndexWsRoute,
  InternalBrowserSessionPutRoute,
  JSONCloseGetRoute,
  ActiveGetRoute,
} from '@/routes';
import { env, Ghostery, makeExternalUrl, writeResponse } from '@/utils';
import { Group } from '@/router';
import { OpenAPI } from '@/openapi';
import { HttpStatus } from '@/constants';
import { BrowserManager } from './cdp';
import { Logger } from './logger';

export interface HeadlessServerOptions {
  port?: number;
  host?: string;
}

const publicDir = path.resolve(process.cwd(), 'public');

export class HeadlessServer {
  private readonly logger = new Logger(this.constructor.name);

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

  private apiInternalGroup: Group;

  private apiGroup: Group;

  private jsonGroup: Group;

  private wsGroup: Group;

  private openApi: OpenAPI;

  constructor(options: HeadlessServerOptions) {
    this.options = options;

    // Set up views
    this.app.set('views', publicDir);

    // Middleware
    this.app.use(express.static(publicDir));
    this.app.use(cors({ origin: '*' }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.raw({ type: 'application/javascript' }));
    this.app.use(timeout('30s'));

    // Routes
    this.apiInternalGroup = new Group(
      [InternalBrowserSessionPutRoute],
      this.app,
      this.headlessServerContext,
      '/internal'
    );

    this.apiGroup = new Group(
      [
        ActiveGetRoute,
        FunctionPostRoute,
        PerformancePostRoute,
        ScreenshotPostRoute,
        PdfPostRoute,
        ScrapePostRoute,
      ],
      this.app,
      this.headlessServerContext,
      '/api'
    );

    this.jsonGroup = new Group(
      [
        JSONGetRoute,
        JSONListGetRoute,
        JSONNewPutRoute,
        JSONActivateGetRoute,
        JSONCloseGetRoute,
        JSONVersionGetRoute,
        JSONProtocolGetRoute,
      ],
      this.app,
      this.headlessServerContext,
      '/json'
    );

    this.wsGroup = new Group(
      [DevtoolsBrowserWsRoute, DevtoolsPageWsRoute, LiveIndexWsRoute, IndexWsRoute],
      this.server!,
      this.headlessServerWebSocketContext,
      '/'
    );

    // Error handling
    this.app.use(<ErrorRequestHandler>((err, _req, _res, next) => {
      this.logger.error(err);
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

    this.openApi = new OpenAPI([
      this.apiInternalGroup,
      this.apiGroup,
      this.jsonGroup,
      this.wsGroup,
    ]);
  }

  async start() {
    // Generate OpenAPI documentation
    this.openApi.generateDocument({
      jsonFileName: path.resolve(process.cwd(), 'public', 'docs', 'swagger.json'),
      title: 'Headless Server',
      version: '1.0.0',
      servers: [{ url: makeExternalUrl('http') }],
    });

    const INITIALIZE_GHOSTERY = env<boolean>('INITIALIZE_GHOSTERY', true);

    if (INITIALIZE_GHOSTERY) {
      try {
        this.logger.info('Initializing Ghostery...');
        await Ghostery.initialize();
        this.logger.info('Ghostery initialized');
      } catch (error) {
        this.logger.error('Error initializing Ghostery:', error);
      }
    }

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
    await new Promise<void>((resolve) => {
      this.server?.close();
      resolve();
    });
    this.server?.removeAllListeners();
    this.server = null;
  }

  private async shutdownWsServer() {
    await new Promise<void>((resolve, reject) =>
      this.wsServer.close((err) => {
        if (err) return reject(err);
        return resolve();
      })
    );
    this.wsServer.removeAllListeners();
  }

  private async shutdownProxy() {
    await new Promise<void>((resolve) => this.proxy!.close(resolve));
    this.proxy?.removeAllListeners();
    this.proxy = null;
  }

  async shutdownRouteGroups() {
    await Promise.all([
      [this.apiInternalGroup, this.apiGroup, this.jsonGroup, this.wsGroup].map((group) =>
        group.shutdown()
      ),
    ]);
  }

  async shutdownBrowserManager() {
    await this.browserManager.shutdown();
  }

  async stop() {
    await Promise.all([
      this.shutdownWsServer(),
      this.shutdownServer(),
      this.shutdownProxy(),
      this.shutdownBrowserManager(),
      this.shutdownRouteGroups(),
    ]);
  }
}
