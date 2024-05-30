import { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { Express, Handler as ApiHandler } from 'express';
import { IncomingMessage, Server } from 'node:http';
import { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { createProxyServer } from 'http-proxy';

import { Omit, Optional } from '@/types';
import { PuppeteerProvider } from './puppeteer-provider';
import { parseUrlFromIncomingMessage } from './utils';

export const enum Method {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  PATCH = 'patch',
  DELETE = 'delete',
  HEAD = 'head',
  OPTIONS = 'options',
  TRACE = 'trace',
  CONNECT = 'connect',
  ALL = 'all',
}

export interface ApiRoute {
  method: Method;
  path: string;
  handler?: ApiHandler;
  handlers?: ApiHandler[];
  swagger?: Omit<RouteConfig, 'method' | 'path'>;
}

export type HeadlessServerContext = {
  wsServer: WebSocketServer;
  puppeteerProvider: PuppeteerProvider;
  proxy: ReturnType<typeof createProxyServer>;
};

export type WsHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  context: HeadlessServerContext
) => any | Promise<any>;

export interface WsRoute {
  path: string;
  handler: WsHandler;
  swagger?: Omit<RouteConfig, 'method' | 'path'>;
}

export type Route = ApiRoute | WsRoute;

export class RouteGroup {
  private routes: Route[] = [];

  constructor(
    private app: Express | Server,
    public prefix?: string,
    private serverContext?: HeadlessServerContext
  ) {}

  registerRoute(zClass: new () => Route) {
    const route = new zClass();

    this.routes.push(route);

    const fullPath = `${this.prefix ?? ''}${route.path}`.replace(/\/{2,}/g, '/');

    if (this.app instanceof Server && !!this.serverContext) {
      const _route = route as WsRoute;
      this.app.on('upgrade', (req, socket, head) => {
        const url = parseUrlFromIncomingMessage(req);

        if (url.pathname === fullPath) {
          return _route.handler(req, socket, head, this.serverContext!);
        }

        const { wsServer } = this.serverContext!;

        return wsServer.handleUpgrade(req, socket, head, (ws) => {
          wsServer.emit('connection', ws, req);
        });
      });
    } else {
      const _route = route as ApiRoute;

      const handlers = Array<Optional<ApiHandler>>()
        .concat(_route.handler, _route.handlers)
        .filter(Boolean);

      (this.app as Express)[_route.method](fullPath, handlers as Array<ApiHandler>);
    }
  }

  getRoutes() {
    return this.routes;
  }
}
