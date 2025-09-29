import { IncomingMessage, STATUS_CODES } from 'node:http';
import { Duplex } from 'node:stream';
import { Request, Response } from 'express';
import { isNil } from 'lodash-es';
import qs from 'qs';
import { z, ZodError } from 'zod';

import { Protocol } from '@/cdp/devtools';
import { HttpStatus } from '@/constants';
import { ResponseBody } from '@/schemas';

import { parseUrlFromIncomingMessage } from './url';

const isHTTP = (writable: Response | Duplex) => 'writeHead' in writable;

export const parseSearchParams = (searchParams: string | Request['query']) => {
  let strQuery: string = searchParams as any;

  if (typeof strQuery !== 'string') {
    strQuery = qs.stringify(strQuery);
  }

  const query = qs.parse(strQuery, { ignoreQueryPrefix: true }) as object;

  return query;
};

export const writeResponse = async (
  writable: Duplex | Response,
  status: HttpStatus = HttpStatus.OK,
  options?: {
    contentType?: string;
    message?: string;
    body?: ResponseBody | Protocol | Error | Array<Error> | z.core.$ZodIssue[] | string;
    skipValidateBody?: boolean;
  }
): Promise<void> => {
  const httpMessage = STATUS_CODES[status];

  if (isHTTP(writable)) {
    const response = writable as Response;

    const { body, skipValidateBody } = options ?? {};

    if (isNil(body)) {
      response.status(HttpStatus.NO_CONTENT).send('');

      return;
    }

    if (typeof body === 'string') {
      response.status(status).send(body);

      return;
    }

    if (body instanceof ZodError) {
      response.status(status).send({
        errors: body.issues.map((error) => ({
          path: error.path.join('.'),
          message: error.message,
        })),
      });

      return;
    }

    if (['data', 'errors'].some((key) => key in body) || skipValidateBody) {
      response.status(status).send(body);

      return;
    }

    const errors = new Array<Error>().concat(body as any).map((error) => {
      if (error instanceof Error) {
        return {
          name: error.name,
          message: error.message,
        };
      }

      return error;
    });

    response.status(status).send({ errors });

    return;
  }

  const socket = writable as Duplex;

  const httpResponse = [
    `HTTP/1.1 ${status} ${httpMessage}`,
    `Content-Type: ${options?.contentType ?? 'text/plain'}`,
    'Content-Encoding: utf-8',
    'Accept-Ranges: bytes',
    'Connection: keep-alive',
    '\r\n',
    options?.message ?? httpMessage,
  ]
    .filter(Boolean)
    .join('\r\n');

  socket.write(httpResponse);

  socket.end();

  return;
};

export const retrieveTokenFromRequest = (req: IncomingMessage) => {
  const url = parseUrlFromIncomingMessage(req);

  const requestTokenInQuery = url.searchParams.get('token');

  const requestTokenInHeader = req.headers.authorization;

  const requestToken = requestTokenInQuery || requestTokenInHeader;

  return requestToken;
};
