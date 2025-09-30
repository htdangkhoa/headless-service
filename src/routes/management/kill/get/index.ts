import dedent from 'dedent';
import { Handler } from 'express';

import { HttpStatus, OPENAPI_BADGES, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import { ResponseBodySchema } from '@/schemas';
import { writeResponse } from '@/utils';

export class ManagementKillGetRoute extends ProxyHttpRoute {
  method = Method.GET;
  path = '/kill/:browserId';
  swagger = {
    tags: [OPENAPI_TAGS.MANAGEMENT_APIS],
    summary: this.path,
    description: dedent`
      Returns a simple "204" HTTP code, with no response, killing the browser with the given id.
    `,
    'x-badges': [OPENAPI_BADGES.BETA],
    responses: {
      204: {
        description: 'Browser killed',
      },
      404: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: ResponseBodySchema.omit({ data: true }),
          },
        },
      },
    },
  };
  handler?: Handler = async (req, res) => {
    const { browserId } = req.params;

    const { browserManager } = this.context;

    const browser = browserManager.getBrowserById(browserId);

    if (!browser) {
      const error = new Error(`Browser with id "${browserId}" not found`);

      return writeResponse(res, HttpStatus.NOT_FOUND, {
        body: error,
      });
    }

    await browserManager.close(browser);

    return writeResponse(res, HttpStatus.NO_CONTENT);
  };
}
