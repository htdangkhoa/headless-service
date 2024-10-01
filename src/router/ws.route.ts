import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';
import WebSocket from 'ws';

import type { BrowserManager, BrowserCDP } from '@/cdp';
import { Logger } from '@/logger';
import { RouteConfig } from './interfaces';
import { HeadlessServerContext } from './http.route';

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
    const { wsServer, browserManager } = this.context;

    const puppeteerBrowser = browser.getPuppeteerBrowser()!;

    const protocol = await browserManager.getJSONProtocol();

    return new Promise<void>((resolve, reject) => {
      const cdpWS = new WebSocket(endpoint, {
        headers: {
          Host: '127.0.0.1',
        },
      });

      const close = async () => {
        this.logger.info('socket closed');

        browser.off('close', close);
        browser.process()?.off('close', close);
        socket.off('close', close);

        cdpWS.close();

        return resolve();
      };

      browser?.once('close', close);
      browser?.process()?.once('close', close);
      socket.once('close', close);

      wsServer.once('connection', (socket, req) => {
        let request: any;

        puppeteerBrowser!.on('CDP.result', (payloadWillBeSent) => {
          const messageWillBeSent = Buffer.from(JSON.stringify(payloadWillBeSent)).toString(
            'utf-8'
          );

          socket.send(Buffer.from(messageWillBeSent));
        });

        // TODO: this is just a sample code to test the custom CDP events
        setTimeout(async () => {
          const pl = {
            sessionId: request.sessionId,
            method: 'HeadlessService.liveComplete',
            params: {
              // test: 'lorem',
              reason: 'done',
            },
          };

          const test = Buffer.from(JSON.stringify(pl)).toString('utf-8');

          socket.send(Buffer.from(test));
        }, 5000);

        cdpWS.on('message', (data: any) => {
          const receivedMessage = Buffer.from(data).toString('utf-8');

          const receivedPayload = JSON.parse(receivedMessage);

          if (receivedPayload.error) {
            const [, method] = receivedPayload.error.message.match(/'(.*)' /) ?? [];

            if (!method) return socket.send(data);

            const [domain, command] = method.split('.');

            const matchedProtocol = protocol.domains.find(
              (d: any) => String(d.domain) === String(domain)
            );

            if (!matchedProtocol) return socket.send(data);

            const matchedCommand = matchedProtocol.commands.find((c: any) => c.name === command);

            if (!matchedCommand) return socket.send(data);

            // manipulate the response for the custom CDP method
            puppeteerBrowser.emit(method, request);
            // request = null;
            return;
          }

          return socket.send(data);
        });

        socket.on('message', (data: any) => {
          const message = Buffer.from(data).toString('utf-8');

          this.logger.info(`Received message:`, message);

          const payload = JSON.parse(message);
          request = payload;

          return cdpWS.send(message);
        });
      });

      wsServer.once('error', (err) => {
        this.logger.error(`WebSocket Server error`, err);

        cdpWS.close();

        browserManager.close(browser);

        return reject(err);
      });

      cdpWS.once('open', () => {
        wsServer.handleUpgrade(req, socket, head, (ws) => {
          wsServer.emit('connection', ws, req);
        });
      });
    });
  }
}
