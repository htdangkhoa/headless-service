import type { IncomingMessage } from 'node:http';
import { z } from 'zod';

import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { PuppeteerExtraPluginLiveUrl } from '@/plugins/puppeteer-extra-plugin-live-url';
import { ProxyWebSocketRoute, WsHandler } from '@/router';
import {
  makeExternalUrl,
  parseUrlFromIncomingMessage,
  removeTrailingSlash,
  writeResponse,
} from '@/utils';

export class LiveIndexWsRoute extends ProxyWebSocketRoute {
  path = '/live';
  swagger = {
    tags: [OPENAPI_TAGS.WS_APIS],
    servers: [
      {
        url: makeExternalUrl('ws'),
      },
    ],
    summary: this.path,
    description: 'Websocket back-end that powers the live session experience.',
    request: {
      query: z.object({
        session: z.string().describe('The sessionId of the live session'),
      }),
    },
    responses: {
      101: {
        description: 'Indicates successful WebSocket upgrade.',
      },
      400: {
        description: 'Bad request',
      },
      500: {
        description: 'Internal Server Error',
      },
    },
  };
  shouldUpgrade = (req: IncomingMessage) => {
    const url = parseUrlFromIncomingMessage(req);
    const pathname = removeTrailingSlash(url.pathname);

    return pathname === this.path;
  };
  handler: WsHandler = async (req, socket, head) => {
    const { wsServer } = this.context;

    const { searchParams } = parseUrlFromIncomingMessage(req);

    const sessionId = searchParams.get('session');

    if (!sessionId) {
      return writeResponse(socket, HttpStatus.BAD_REQUEST, {
        message: 'Missing session id',
      });
    }

    return wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit(PuppeteerExtraPluginLiveUrl.prototype.constructor.name, ws, req);
    });
  };
}
