import type { IncomingMessage } from 'node:http';
import jwt from 'jsonwebtoken';

import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { PuppeteerExtraPluginLiveUrl } from '@/plugins/puppeteer-extra-plugin-live-url';
import { ProxyWebSocketRoute, WsHandler } from '@/router';
import {
  env,
  makeExternalUrl,
  parseUrlFromIncomingMessage,
  removeTrailingSlash,
  writeResponse,
} from '@/utils';

export class LiveIndexWsRoute extends ProxyWebSocketRoute {
  path = '/live';
  auth = false;
  shouldUpgrade = (req: IncomingMessage) => {
    const url = parseUrlFromIncomingMessage(req);
    const pathname = removeTrailingSlash(url.pathname);

    return pathname === this.path;
  };
  handler: WsHandler = async (req, socket, head) => {
    const url = parseUrlFromIncomingMessage(req);

    const session = url.searchParams.get('session') ?? '';

    if (!session) {
      return writeResponse(socket, HttpStatus.BAD_REQUEST, {
        message: 'Invalid session',
      });
    }

    let payload: jwt.JwtPayload | undefined;

    try {
      payload = jwt.verify(session, env('HEADLESS_SERVICE_TOKEN')!, {
        audience: [makeExternalUrl('http', 'live')],
        issuer: url.hostname,
      }) as jwt.JwtPayload;
    } catch {}

    if (!payload) {
      return writeResponse(socket, HttpStatus.BAD_REQUEST, {
        message: 'Invalid session',
      });
    }

    const { browserManager, wsServer } = this.context;

    const browser = browserManager.getBrowserById(payload.browserId);

    if (!browser) {
      return writeResponse(socket, HttpStatus.BAD_REQUEST, {
        message: 'Invalid session',
      });
    }

    return wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit(PuppeteerExtraPluginLiveUrl.prototype.constructor.name, ws, req);
    });
  };
}
