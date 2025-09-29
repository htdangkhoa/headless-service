import dayjs from 'dayjs';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { HttpStatus } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import { NumberOrStringSchema } from '@/schemas';
import { useTypedParsers, writeResponse } from '@/utils';

const RequestSessionParamsSchema = z.object({
  browser_id: z.string(),
});

const RequestSessionBodySchema = z.object({
  keep_alive: NumberOrStringSchema,
});

export class InternalBrowserSessionPutRoute extends ProxyHttpRoute {
  path = '/browser/:browser_id/session';
  method = Method.PUT;
  internal = true;
  handler = (req: Request, res: Response) => {
    this.logger.info('InternalBrowserSessionPutRoute');
    const paramsValidation = useTypedParsers(RequestSessionParamsSchema).safeParse(
      req.params as any
    );

    if (!paramsValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: paramsValidation.error,
      });
    }

    const bodyValidation = useTypedParsers(RequestSessionBodySchema).safeParse(req.body);

    if (!bodyValidation.success) {
      return writeResponse(res, HttpStatus.BAD_REQUEST, {
        body: bodyValidation.error,
      });
    }

    const { browserManager } = this.context;

    const { browser_id: browserId } = paramsValidation.data;
    this.logger.info(`Keep alive for browser "${browserId}"`);

    const { keep_alive: keepAliveMs } = bodyValidation.data;
    this.logger.info(`Keep alive for ${keepAliveMs}ms`);

    const browser = browserManager.getBrowserById(browserId);

    if (!browser) {
      const error = new Error(`Browser with id "${browserId}" not found`);
      return writeResponse(res, HttpStatus.NOT_FOUND, {
        body: error,
      });
    }

    const now = dayjs();
    const expiresAt = now.add(keepAliveMs, 'milliseconds');

    browser.setExpiresAt(expiresAt.toDate());

    return writeResponse(res, HttpStatus.OK, {
      body: {
        data: expiresAt.toISOString(),
      },
    });
  };
}
