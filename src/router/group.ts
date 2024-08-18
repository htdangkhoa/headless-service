import type { Express, Handler } from 'express';
import type { Server } from 'node:http';

import { Optional } from '@/types';
import { writeResponse } from '@/utils';
import { HttpStatus } from '@/constants';
import { HeadlessServerContext, ProxyHttpRoute } from './http.route';
import { HeadlessServerWebSocketContext, ProxyWebSocketRoute } from './ws.route';

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

    this.handleHttpRoutes(httpRoutes);

    this.handleWebSocketRoutes(wsRoutes);
  }

  private getFullPath(route: Route) {
    return `${this.prefix ?? ''}${route.path}`.replace(/\/{2,}/g, '/');
  }

  private handleHttpRoutes(routes: ProxyHttpRoute[]) {
    routes.forEach((route) => {
      const fullPath = this.getFullPath(route);

      const handlers = Array<Optional<Handler>>()
        .concat(route.handler, route.handlers)
        .filter(Boolean);

      (this.app as Express)[route.method](fullPath, handlers as Array<Handler>);
    });
  }

  private handleWebSocketRoutes(routes: ProxyWebSocketRoute[]) {
    this.app.on('upgrade', (req, socket, head) => {
      const route = routes.find((r) => r.shouldUpgrade(req));

      if (route) {
        return route.handler(req, socket, head);
      }

      return writeResponse(socket, HttpStatus.NOT_FOUND, {
        message: 'Not found',
      });
    });
  }

  getRoutes() {
    return this.routes;
  }
}
