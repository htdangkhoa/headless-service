import type { Express, Handler } from 'express';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { Maybe, Optional } from '@/types';
import { getFullPath, parseUrlFromIncomingMessage, writeResponse } from '@/utils';
import { HttpStatus } from '@/constants';
import { HeadlessServerContext, ProxyHttpRoute } from './http.route';
import { HeadlessServerWebSocketContext, ProxyWebSocketRoute } from './ws.route';
import { RequestIdContext } from '@/request-id-context';

export type Route = ProxyHttpRoute | ProxyWebSocketRoute;

export type RouteClass = new (
  serverContext: any
) => any extends HeadlessServerContext ? ProxyHttpRoute : ProxyWebSocketRoute;

export class Group {
  private routes: Route[] = [];

  constructor(
    readonly rClasses: Array<RouteClass>,
    private app: Express | Server,
    private serverContext: HeadlessServerContext | HeadlessServerWebSocketContext,
    public prefix?: string
  ) {
    rClasses.forEach((clz) => {
      const route = new clz(this.serverContext);
      this.routes.push(route);
    });

    const httpRoutes = this.routes.filter((route) => route instanceof ProxyHttpRoute);

    const wsRoutes = this.routes.filter((route) => route instanceof ProxyWebSocketRoute);

    httpRoutes.length && this.handleHttpRoutes(httpRoutes);

    wsRoutes.length && this.handleWebSocketRoutes(wsRoutes);
  }

  private handleHttpRoutes(routes: ProxyHttpRoute[]) {
    (this.app as Express).use((req, _, next) => {
      const requestId = req.query.request_id as Maybe<string>;

      return RequestIdContext.getInstance().run({ requestId }, () => {
        req.requestId = requestId;

        return next();
      });
    });

    routes.forEach((route) => {
      const fullPath = getFullPath(route.path, this.prefix);

      const handlers = Array<Optional<Handler>>()
        .concat(route.handler, route.handlers)
        .filter(Boolean);

      (this.app as Express)[route.method](fullPath, handlers as Array<Handler>);
    });
  }

  private handleWebSocketRoutes(routes: ProxyWebSocketRoute[]) {
    this.app.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = parseUrlFromIncomingMessage(req);

      const requestId = url.searchParams.get('request_id');

      return RequestIdContext.getInstance().run({ requestId }, () => {
        req.requestId = requestId;
        socket.requestId = requestId;

        const route = routes.find((r) => r.shouldUpgrade(req));

        if (route) {
          return route.handler(req, socket, head);
        }

        return writeResponse(socket, HttpStatus.NOT_FOUND, {
          message: 'Not found',
        });
      });
    });
  }

  getRoutes() {
    return this.routes;
  }

  shutdown() {
    this.routes = [];
  }
}
