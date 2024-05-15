import { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { Express, Handler } from 'express';

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

export interface Route
  extends Pick<
    RouteConfig,
    'tags' | 'summary' | 'description' | 'deprecated' | 'path' | 'request'
  > {
  method: Method;
  security?: {
    [name: string]: string[];
  };
  responses: RouteConfig['responses'];
  handlers: Array<Handler>;
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
    this.app[route.method](fullPath, route.handlers);
  }

  getRoutes() {
    return this.routes;
  }
}
