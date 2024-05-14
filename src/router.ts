import { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { Router, Handler } from 'express';

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

export class GroupRouter {
  private router: Router;

  private routes: Route[] = [];

  constructor(public prefix?: string) {
    this.router = Router();
  }

  registerRoute(zClass: new () => Route) {
    const route = new zClass();
    this.routes.push(route);
    const fullPath = `${this.prefix ?? ''}${route.path}`;
    this.router[route.method](fullPath, route.handlers);
  }

  getRouter() {
    return this.router;
  }

  getRoutes() {
    return this.routes;
  }
}
