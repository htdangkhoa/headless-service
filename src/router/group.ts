import type { Express, Handler } from 'express';
import { Server } from 'node:http';

import { HeadlessServerContext, ProxyHttpRoute } from './http.route';
import { HeadlessServerWebSocketContext, ProxyWebSocketRoute } from './ws.route';
import { Optional } from '@/types';

export type Route = ProxyHttpRoute | ProxyWebSocketRoute;

export type RouteClass = new (
  serverContext: any
) => any extends HeadlessServerContext ? ProxyHttpRoute : ProxyWebSocketRoute;

export class Group {
  private routes: Route[] = [];

  constructor(
    private app: Express | Server,
    private serverContext: HeadlessServerContext | HeadlessServerWebSocketContext,
    public prefix?: string
  ) {}

  registerRoute(zClass: RouteClass) {
    const route = new zClass(this.serverContext);

    this.routes.push(route);

    const fullPath = `${this.prefix ?? ''}${route.path}`.replace(/\/{2,}/g, '/');

    if (this.app instanceof Server && route instanceof ProxyWebSocketRoute) {
      const _route = route;
      this.app.on('upgrade', (req, socket, head) => {
        if (_route.shouldUpgrade(req)) {
          return _route.handler(req, socket, head);
        }
      });
    } else if (route instanceof ProxyHttpRoute) {
      const _route = route;

      const handlers = Array<Optional<Handler>>()
        .concat(_route.handler, _route.handlers)
        .filter(Boolean);

      (this.app as Express)[_route.method](fullPath, handlers as Array<Handler>);
    } else {
      throw new Error('Unsupported route type');
    }
  }

  registerRoutes(zClasses: Array<RouteClass>) {
    zClasses.forEach(this.registerRoute.bind(this));
  }

  getRoutes() {
    return this.routes;
  }
}
