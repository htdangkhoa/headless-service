import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { WebSocketServer } from 'ws';
import type ProxyServer from 'http-proxy';
import type { Browser } from 'puppeteer';

import type { PuppeteerProvider } from '@/puppeteer-provider';

export type WsHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => any | Promise<any>;

export interface WsRoute {
  path: string;
  handler: WsHandler;
  shouldUpgrade: (req: IncomingMessage) => boolean;
  swagger?: Omit<RouteConfig, 'method' | 'path'>;
}

export interface HeadlessServerWebSocketContext {
  wsServer: WebSocketServer;
  puppeteerProvider: PuppeteerProvider;
  proxy: ProxyServer;
}

export abstract class ProxyWebSocketRoute implements WsRoute {
  constructor(protected context: HeadlessServerWebSocketContext) {}

  abstract path: string;
  abstract handler: WsHandler;
  abstract shouldUpgrade: (req: IncomingMessage) => boolean;
  swagger?: Omit<RouteConfig, 'method' | 'path'>;

  protected proxyWebSocket(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    browser: Browser,
    endpoint: string
  ) {
    const { puppeteerProvider, proxy } = this.context;

    return new Promise<void>((resolve, reject) => {
      const close = async () => {
        console.log('socket closed');

        try {
          await puppeteerProvider.complete(browser);
        } catch (error) {
          console.warn('Error closing browser', error);
        }

        browser.off('close', close);
        browser.process()?.off('close', close);
        socket.off('close', close);
        return resolve();
      };

      browser?.once('close', close);
      browser?.process()?.once('close', close);
      socket.once('close', close);

      req.url = '';

      // Delete headers known to cause issues
      delete req.headers.origin;

      proxy.ws(
        req,
        socket,
        head,
        {
          target: endpoint,
          changeOrigin: true,
        },
        (error) => {
          puppeteerProvider.complete(browser);
          return reject(error);
        }
      );
    });
  }
}
