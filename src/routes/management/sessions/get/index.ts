import dedent from 'dedent';
import { Handler } from 'express';
import z from 'zod';

import { HttpStatus, OPENAPI_BADGES, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import { BrowserSessionSchema, ResponseBodySchema } from '@/schemas';
import { writeResponse } from '@/utils';

export class ManagementSessionsGetRoute extends ProxyHttpRoute {
  method = Method.GET;
  path = '/sessions';
  swagger = {
    tags: [OPENAPI_TAGS.MANAGEMENT_APIS],
    summary: this.path,
    description: dedent`
      Returns a list of all sessions.
    `,
    'x-badges': [OPENAPI_BADGES.BETA],
    responses: {
      200: {
        description: 'List of browser sessions',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ errors: true }).extend({
              data: z.array(BrowserSessionSchema),
            }),
          },
        },
      },
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ data: true }),
          },
        },
      },
    },
  };
  handler?: Handler = async (req, res) => {
    const { browserManager } = this.context;

    const sessions = browserManager.getAllSessions();

    return writeResponse(res, HttpStatus.OK, {
      body: {
        data: sessions,
      },
    });
  };
}
