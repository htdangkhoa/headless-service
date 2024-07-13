import { Duplex } from 'node:stream';
import { STATUS_CODES } from 'node:http';
import { Request, Response } from 'express';
import { ZodIssue, ZodError, z } from 'zod';
import qs from 'qs';

import { Dictionary } from '@/types';
import { HttpStatus } from '@/constants';
import { ResponseBody } from './schema';

const isHTTP = (writable: Response | Duplex) => 'writeHead' in writable;

export const parseSearchParams = <Schema extends z.ZodType<any, z.ZodTypeDef, any>>(
  searchParams: string | Request['query']
) => {
  let query: Dictionary = searchParams as Dictionary;
  if (typeof searchParams === 'string') {
    query = qs.parse(searchParams, { ignoreQueryPrefix: true }) as object;
  }

  return query;
};

export const writeResponse = async (
  writable: Duplex | Response,
  status: HttpStatus = HttpStatus.OK,
  options?: {
    contentType?: string;
    message?: string;
    body?: ResponseBody | Error | Array<Error> | ZodIssue[];
  }
) => {
  const httpMessage = STATUS_CODES[status];

  if (isHTTP(writable) && options?.body) {
    const response = writable as Response;

    const { body } = options;

    if (body instanceof ZodError) {
      return response.status(status).send({
        errors: body.errors.map((error) => ({
          path: error.path.join('.'),
          message: error.message,
        })),
      });
    }

    if (['data', 'errors'].some((key) => key in body)) {
      return response.status(status).send(body);
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

    return response.status(status).send({ errors });
  }

  const httpResponse = [
    `HTTP/1.1 ${status} ${httpMessage}`,
    `Content-Type: ${options?.contentType ?? 'text/plain'}`,
    'Content-Encoding: utf-8',
    'Accept-Ranges: bytes',
    'Connection: keep-alive',
    '\r\n',
    options?.message ?? httpMessage,
  ].join('\r\n');

  const response = writable as Duplex;

  response.write(httpResponse);
  return response.end();
};

export const getFullPath = (path: string, prefix?: string) =>
  [prefix, path]
    .filter(Boolean)
    .join('')
    .replace(/\/{2,}/g, '/');
