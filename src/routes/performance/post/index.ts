import { Handler } from 'express';
import { z } from 'zod';
import zu from 'zod_utilz';
import { fork } from 'node:child_process';
import treeKill from 'tree-kill';

import { Method, Route } from '@/route-group';
import { PuppeteerProvider } from '@/puppeteer-provider';
import {
  NumberOrStringSchema,
  RequestLaunchQuerySchema,
  ResponseBodySchema,
  env,
  writeResponse,
} from '@/utils';
import { Events, IChildProcessInput, IChildProcessOutput } from './child';
import { OPENAPI_TAGS } from '@/constants';

const RequestPerformanceQuerySchema = z
  .object({
    launch: RequestLaunchQuerySchema.optional(),
  })
  .strict();

const RequestPerformanceBodySchema = z
  .object({
    url: z.string(),
    config: z.record(z.unknown()).optional(),
    timeout: NumberOrStringSchema.optional(),
  })
  .strict();

export class PerformancePostRoute implements Route {
  method = Method.POST;
  path = '/performance';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    request: {
      query: RequestPerformanceQuerySchema,
      body: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: RequestPerformanceBodySchema,
            example: {
              url: 'https://example.com',
              config: {
                extends: 'lighthouse:default',
              },
              timeout: 10000,
            },
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
    const queryValidation = zu.useTypedParsers(RequestPerformanceQuerySchema).safeParse(req.query);

    if (!queryValidation.success) {
      return writeResponse(res, queryValidation.error, 400);
    }

    const bodyValidation = zu.useTypedParsers(RequestPerformanceBodySchema).safeParse(req.body);

    if (!bodyValidation.success) {
      return writeResponse(res, bodyValidation.error, 400);
    }

    const { timeout, ...childData } = bodyValidation.data;

    const puppeteerProvider = req.app.get('puppeteerProvider') as PuppeteerProvider;

    const browser = await puppeteerProvider.launchBrowser(req, queryValidation.data.launch);

    const browserWSEndpoint = browser.wsEndpoint();

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
          }, timeout)
        : null;

    const close = async (pid?: number) => {
      if (closed) return;
      if (pid) treeKill(pid, 'SIGINT');
      timeoutId && clearTimeout(timeoutId);
      closed = true;
      timeoutId = null;
      await puppeteerProvider.closeBrowser(browser);
    };

    child.on('error', (error) => {
      console.error(error);
      return writeResponse(res, error, 500);
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
          return writeResponse(res, { data: message.data }, 200);
        }
        case Events.ERROR: {
          close(child.pid);
          return writeResponse(res, message.error!, 500);
        }
        default: {
          close(child.pid);
          return writeResponse(res, new Error('Something went wrong'), 500);
        }
      }
    });
  };
}
