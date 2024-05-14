import { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { Router, type Handler, type IRouter } from 'pure-http';

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
  private router: IRouter;

  private routes: Route[] = [];

  constructor(public prefix?: string) {
    this.router = Router(prefix);
  }

  registerRoute(zClass: new () => Route) {
    const route = new zClass();
    this.routes.push(route);
    this.router[route.method](route.path, ...route.handlers);
  }

  getRouter() {
    return this.router;
  }

  getRoutes() {
    return this.routes;
  }
}
