import { Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodIssue } from 'zod';

import { ResponseBody } from './schema';

export const writeResponse = async (
  response: Response,
  body: ResponseBody | Error | Array<Error> | ZodIssue[],
  status: StatusCodes = StatusCodes.OK
) => {
  if (['data', 'errors'].some((key) => key in body)) {
    return response.status(status).send(body);
  }

  const errors = new Array<Error>().concat(body as any);

  return response.status(status).send({ errors });
};
