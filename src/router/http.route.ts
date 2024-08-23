import type { Handler } from 'express';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type ProxyServer from 'http-proxy';

import type { BrowserManager } from '@/cdp';
import { Logger } from '@/logger';

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

export interface HttpRoute {
  method: Method;
  path: string;
  handler?: Handler;
  handlers?: Handler[];
  swagger?: Omit<RouteConfig, 'method' | 'path'>;
}

export interface HeadlessServerContext {
  browserManager: BrowserManager;
  proxy: ProxyServer;
}

export abstract class ProxyHttpRoute implements HttpRoute {
  readonly logger = new Logger(this.constructor.name);

  constructor(protected context: HeadlessServerContext) {}

  abstract method: Method;
  abstract path: string;
  handler?: Handler;
  handlers?: Handler[];
  swagger?: Omit<RouteConfig, 'method' | 'path'>;
}
