import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocketServer } from 'ws';
import WebSocket from 'ws';

import type { BrowserCDP } from '@/cdp';
import { DispatchResponse, ProtocolRequest, Request, Response } from '@/cdp/devtools';
import { DOMAINS } from '@/constants';
import { Logger } from '@/logger';
import { buildProtocolEventNames } from '@/utils';

import { HeadlessServerContext } from './http.route';
import { OpenApiRoute, RouteConfig } from './interfaces';

export type WsHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => any | Promise<any>;

export interface WsRoute extends OpenApiRoute<WsHandler> {
  shouldUpgrade: (req: IncomingMessage) => boolean;
}

export interface HeadlessServerWebSocketContext extends HeadlessServerContext {
  wsServer: WebSocketServer;
}

export abstract class ProxyWebSocketRoute implements WsRoute {
  readonly logger = new Logger(this.constructor.name);

  constructor(protected context: HeadlessServerWebSocketContext) {}

  abstract path: string;
  internal?: boolean | undefined;
  auth: boolean = true;
  abstract handler: WsHandler;
  abstract shouldUpgrade: (req: IncomingMessage) => boolean;
  swagger?: Omit<RouteConfig, 'method' | 'path'>;

  protected async proxyWebSocket(
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

      client.once('open', () => {
        wsServer.handleUpgrade(req, socket, head, (serverSocket) => {
          this.logger.info('socket connected');

          client.on('message', (data: any) => {
            const message = Buffer.from(data).toString('utf-8');

            this.logger.debug(`Received message:`, message);

            return serverSocket.send(message);
          });

          serverSocket.on('message', (data: any) => {
            const message = Buffer.from(data).toString('utf-8');
            let payload: unknown;
            try {
              payload = JSON.parse(message);
            } catch (error) {
              this.logger.warn('Invalid WS payload received:', error);
              return;
            }

            const request = Request.parse(payload);

            const customDomains = Object.values(DOMAINS);

            if (customDomains.some((d) => request.method.startsWith(d))) {
              return this.onCustomCDPCommand(serverSocket, request, browser);
            }

            return client.send(message);
          });

          wsServer.emit('connection', serverSocket, req);
        });
      });
    });
  }

  private async onCustomCDPCommand(
    socket: WebSocket,
    request: ProtocolRequest,
    browser: BrowserCDP
  ) {
    this.logger.debug('Received custom CDP command:', request);

    const protocol = await browser.getJSONProtocol();

    const [domain, command] = request.method.split('.');

    const matchedProtocol = protocol.domains.find((d) => String(d.domain) === String(domain));

    const dispatchResponse = DispatchResponse.MethodNotFound(`'${request.method}' wasn't found`);
    const errorResponse = Response.error(request.id!, dispatchResponse, request.sessionId);
    const errorBuffer = Buffer.from(JSON.stringify(errorResponse));

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
      request.method
    );

    puppeteerBrowser.on(eventNameForResult, (resultResponse) => {
      this.logger.debug('Received result for custom CDP command:', resultResponse);

      const resultBuffer = Buffer.from(JSON.stringify(resultResponse)).toString('utf-8');

      return socket.send(resultBuffer);
    });

    /**
     * Emit the command to the browser
     */
    puppeteerBrowser.emit(eventNameForListener, request);
  }
}
