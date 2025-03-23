import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';
import WebSocket from 'ws';

import type { BrowserCDP } from '@/cdp';
import { Logger } from '@/logger';
import { buildProtocolEventNames } from '@/utils';
import { RouteConfig } from './interfaces';
import { HeadlessServerContext } from './http.route';
import { DOMAINS } from '@/constants';

export type WsHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => any | Promise<any>;

export interface WsRoute {
  path: string;
  handler: WsHandler;
  shouldUpgrade: (req: IncomingMessage) => boolean;
  swagger?: RouteConfig;
}

export interface HeadlessServerWebSocketContext extends HeadlessServerContext {
  wsServer: WebSocketServer;
}

export abstract class ProxyWebSocketRoute implements WsRoute {
  readonly logger = new Logger(this.constructor.name);

  constructor(protected context: HeadlessServerWebSocketContext) {}

  abstract path: string;
  abstract handler: WsHandler;
  abstract shouldUpgrade: (req: IncomingMessage) => boolean;
  swagger?: Omit<RouteConfig, 'method' | 'path'>;

  protected proxyWebSocket(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    browser: BrowserCDP,
    endpoint: string
  ) {
    const { browserManager, proxy } = this.context;

    return new Promise<void>((resolve, reject) => {
      const close = async () => {
        this.logger.info('socket closed');

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
          browserManager.close(browser);
          return reject(error);
        }
      );
    });
  }

  protected async proxyWebSocketV2(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    browser: BrowserCDP,
    endpoint: string
  ) {
    const { wsServer } = this.context;

    const client = new WebSocket(endpoint, {
      headers: {
        Host: '127.0.0.1',
      },
    });

    return new Promise<void>((resolve, reject) => {
      const close = async () => {
        this.logger.info('socket closed');

        browser.off('close', close);
        browser.process()?.off('close', close);
        socket.off('close', close);
        wsServer.off('close', close);
        wsServer.off('error', close);

        client.close();

        return resolve();
      };

      browser?.once('close', close);
      browser?.process()?.once('close', close);
      socket.once('close', close);
      wsServer.once('close', close);
      wsServer.once('error', close);

      wsServer.once('connection', (s, r) => {
        this.logger.info('socket connected');

        client.on('message', (data: any) => {
          const message = Buffer.from(data).toString('utf-8');

          this.logger.info(`Received message:`, message);

          return s.send(data);
        });

        s.on('message', (data: any) => {
          const message = Buffer.from(data).toString('utf-8');

          const payload = JSON.parse(message);

          const customDomains = Object.values(DOMAINS);

          if (customDomains.some((d) => payload.method.startsWith(d))) {
            return this.onCustomCDPCommand(s, payload, browser);
          }

          return client.send(message);
        });
      });

      client.once('open', () => {
        wsServer.handleUpgrade(req, socket, head, (ws) => {
          wsServer.emit('connection', ws, req);
        });
      });
    });
  }

  private async onCustomCDPCommand(socket: WebSocket, payload: any, browser: BrowserCDP) {
    this.logger.info('Received custom CDP command:', payload);

    const protocol = await browser.getJSONProtocol();

    const [domain, command] = payload.method.split('.');

    const matchedProtocol = protocol.domains.find((d) => String(d.domain) === String(domain));

    const errorPayload = {
      id: payload.id,
      error: { code: -32601, message: `'${payload.method}' wasn't found` },
      sessionId: payload.sessionId,
    };
    const errorBuffer = Buffer.from(JSON.stringify(errorPayload));

    if (!matchedProtocol) return socket.send(errorBuffer);

    const matchedCommand = (matchedProtocol.commands ?? []).find((c) => c.name === command);

    if (!matchedCommand) return socket.send(errorBuffer);

    const puppeteerBrowser = browser.getPuppeteerBrowser()!;

    const browserId = browser.id();

    /**
     * Listen for the result of the command
     */
    const { eventNameForListener, eventNameForResult } = buildProtocolEventNames(
      browserId,
      payload.method
    );

    puppeteerBrowser.on(eventNameForResult, (result) => {
      this.logger.debug('Received result for custom CDP command:', result);

      const resultBuffer = Buffer.from(JSON.stringify(result));

      return socket.send(resultBuffer);
    });

    /**
     * Emit the command to the browser
     */
    puppeteerBrowser.emit(eventNameForListener, payload);
  }
}
