import { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { Express, Handler } from 'express';

import { Omit, Optional } from '@/types';

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

export interface Route {
  method: Method;
  path: string;
  handler?: Handler;
  handlers?: Handler[];
  swagger?: Omit<RouteConfig, 'method' | 'path'>;
}

export class RouteGroup {
  private routes: Route[] = [];

  constructor(
    private app: Express,
    public prefix?: string
  ) {}

  registerRoute(zClass: new () => Route) {
    const route = new zClass();

    this.routes.push(route);

    const fullPath = `${this.prefix ?? ''}${route.path}`;

    const handlers = Array<Optional<Handler>>()
      .concat(route.handler, route.handlers)
      .filter(Boolean);

    this.app[route.method](fullPath, handlers as Array<Handler>);
  }

  getRoutes() {
    return this.routes;
  }
}
