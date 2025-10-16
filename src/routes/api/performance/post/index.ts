import { fork } from 'node:child_process';
import { Handler } from 'express';
import { isNil } from 'lodash-es';
import treeKill from 'tree-kill';
import { z } from 'zod';

import { DEFAULT_REQUEST_TIMEOUT, HttpStatus, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import {
  NumberOrStringSchema,
  RequestDefaultQuerySchema,
  RequestDefaultQueryWithTokenSchema,
  ResponseBodySchema,
} from '@/schemas';
import { env, parseSearchParams, useTypedParsers, writeResponse } from '@/utils';

import { Events, IChildProcessInput, IChildProcessOutput } from './child';

const RequestPerformanceBodySchema = z
  .object({
    url: z.string(),
    config: z.record(z.string(), z.unknown()).optional(),
    timeout: NumberOrStringSchema.optional(),
  })
  .strict();

export class PerformancePostRoute extends ProxyHttpRoute {
  method = Method.POST;
  path = '/performance';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: 'Run lighthouse performance audits with a supplied "url" in your JSON payload.',
    request: {
      query: RequestDefaultQuerySchema,
      body: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: RequestPerformanceBodySchema.meta({
              example: {
                url: 'https://example.com',
                config: {
                  extends: 'lighthouse:default',
                },
                timeout: 10000,
              },
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ errors: true }),
          },
        },
      },
      400: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ data: true }),
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ data: true }),
          },
        },
      },
    },
  };
  handler?: Handler = async (req, res) => {
    req.clearTimeout();

    const { browserManager } = this.context;

    const query = parseSearchParams(req.query);

    const queryValidation = useTypedParsers(RequestDefaultQueryWithTokenSchema).safeParse(query);

    if (!queryValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: queryValidation.error.issues,
      });
    }

    const bodyValidation = useTypedParsers(RequestPerformanceBodySchema).safeParse(req.body);

    if (!bodyValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: bodyValidation.error.issues,
      });
    }

    let { timeout, ...childData } = bodyValidation.data;

    if (isNil(timeout)) {
      timeout = env<number>('REQUEST_TIMEOUT', DEFAULT_REQUEST_TIMEOUT)!;
    }

    const browser = await browserManager.requestBrowser(req, queryValidation.data);

    const browserWSEndpoint = browser.wsEndpoint()!;

    let ext = 'ts';
    if (env('NODE_ENV') === 'production') {
      ext = 'js';
    }

    const childPath = new URL(`child.${ext}`, import.meta.url).pathname;

    const child = fork(childPath);

    let closed = false;
    let timeoutId =
      timeout && timeout > 0
        ? setTimeout(() => {
            close(child.pid);

            const error = new Error('Request Timeout');

            writeResponse(res, HttpStatus.REQUEST_TIMEOUT, {
              body: error,
            });
          }, timeout)
        : null;

    const close = async (pid?: number) => {
      if (closed) return;
      if (pid) treeKill(pid, 'SIGINT');
      timeoutId && clearTimeout(timeoutId);
      closed = true;
      timeoutId = null;
      await browserManager.complete(browser);
    };

    child.on('error', (error) => {
      this.logger.error(error);
      return writeResponse(res, HttpStatus.INTERNAL_SERVER_ERROR, {
        body: error,
      });
    });

    child.on('message', (message: IChildProcessOutput) => {
      switch (message.event) {
        case Events.INIT: {
          const messageInput: IChildProcessInput = {
            event: Events.START,
            browserWSEndpoint,
            payload: childData,
          };
          return child.send(messageInput);
        }
        case Events.COMPLETE: {
          close(child.pid);
          return writeResponse(res, HttpStatus.OK, {
            body: { data: message.data },
          });
        }
        case Events.ERROR: {
          close(child.pid);
          return writeResponse(res, HttpStatus.INTERNAL_SERVER_ERROR, {
            body: message.error,
          });
        }
        default: {
          close(child.pid);
          const error = new Error('Something went wrong');
          return writeResponse(res, HttpStatus.INTERNAL_SERVER_ERROR, {
            body: error,
          });
        }
      }
    });
  };
}
