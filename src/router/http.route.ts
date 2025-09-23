import type { Handler } from 'express';

import type { BrowserManager } from '@/cdp';
import { Logger } from '@/logger';
import { OpenApiRoute, RouteConfig } from './interfaces';
import { IncomingMessage } from 'http';

export enum Method {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  PATCH = 'patch',
  DELETE = 'delete',
  HEAD = 'head',
  OPTIONS = 'options',
  TRACE = 'trace',
  ALL = 'all',
}

export interface HttpRoute extends OpenApiRoute<Handler> {
  method: Method;
  handlers?: Handler[];
}

export interface HeadlessServerContext {
  browserManager: BrowserManager;
}

export abstract class ProxyHttpRoute implements HttpRoute {
  readonly logger = new Logger(this.constructor.name);

  constructor(protected context: HeadlessServerContext) {}

  abstract method: Method;
  abstract path: string;
  auth: boolean = true;
  handler?: Handler;
  handlers?: Handler[];
  swagger?: Omit<RouteConfig, 'method' | 'path'>;
}
