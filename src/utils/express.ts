import { Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodIssue, ZodError } from 'zod';

import { ResponseBody } from './schema';

export const writeResponse = async (
  response: Response,
  body: ResponseBody | Error | Array<Error> | ZodIssue[],
  status: StatusCodes = StatusCodes.OK
) => {
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
};
