import dedent from 'dedent';
import type { Handler } from 'express';
import { z } from 'zod';

import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import { useTypedParsers, writeResponse } from '@/utils';

const RequestJsonCloseParamsSchema = z.object({
  targetId: z.string().optional().describe('The target ID to close'),
});

export class JSONCloseGetRoute extends ProxyHttpRoute {
  method = Method.GET;
  path = '/close/{targetId}';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`Closes the target page identified by \`targetId\`.`,
    responses: {
      200: {
        description: 'Valid target and browser can close it',
        content: {
          'text/html': {
            schema: z.string().describe('Target is closing').meta({
              example: 'Target is closing',
            }),
          },
        },
      },
      404: {
        description: 'No such target id',
        content: {
          'text/html': {
            schema: z.string().describe('No such target id').meta({
              example: 'No such target id: 1234567890',
            }),
          },
        },
      },
    },
  };
  handler: Handler = async (req, res) => {
    const paramsValidation = useTypedParsers(RequestJsonCloseParamsSchema).safeParse(req.params);

    if (!paramsValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: paramsValidation.error.message,
      });
    }

    const { targetId } = paramsValidation.data;

    const { browserManager } = this.context;

    if (!targetId) {
      return writeResponse(res, HttpStatus.NOT_FOUND, {
        body: `No such target id: ${targetId}`,
      });
    }

    const browser = await browserManager.getBrowserByPageId(targetId);

    if (!browser) {
      return writeResponse(res, HttpStatus.NOT_FOUND, {
        body: `No such target id: ${targetId}`,
      });
    }

    const page = await browser.getPageById(targetId);

    if (!page) {
      return writeResponse(res, HttpStatus.NOT_FOUND, {
        body: `No such target id: ${targetId}`,
      });
    }

    await page.close();

    return writeResponse(res, HttpStatus.OK, {
      body: 'Target is closing',
    });
  };
}
