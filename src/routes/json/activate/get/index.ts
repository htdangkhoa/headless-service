import type { Handler } from 'express';
import { z } from 'zod';
import dedent from 'dedent';

import { Method, ProxyHttpRoute, RouteConfig } from '@/router';
import { useTypedParsers, writeResponse } from '@/utils';
import { HttpStatus, OPENAPI_TAGS } from '@/constants';

const RequestJsonActivateParamsSchema = z.object({
  targetId: z.string().optional().describe('The target ID to activate'),
});

export class JSONActivateGetRoute extends ProxyHttpRoute {
  method = Method.GET;
  path = '/activate/{targetId}';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`Brings a page into the foreground (activate a tab).`,
    responses: {
      200: {
        description: 'Valid target and browser can make it active',
        content: {
          'text/html': {
            schema: z.string().describe('Target activated').meta({
              example: 'Target activated',
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
    const paramsValidation = useTypedParsers(RequestJsonActivateParamsSchema).safeParse(req.params);

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

    await page.bringToFront();

    return writeResponse(res, HttpStatus.OK, {
      body: 'Target activated',
    });
  };
}
