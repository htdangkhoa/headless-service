import dedent from 'dedent';
import type { Handler } from 'express';

import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { Method, ProxyHttpRoute } from '@/router';
import { writeResponse } from '@/utils';

export class ActiveGetRoute extends ProxyHttpRoute {
  method: Method = Method.GET;
  path: string = '/active';
  auth: boolean = false;
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`
      Returns a simple "204" HTTP code, with no response, indicating that the service itself is up and running.
      Useful for liveliness probes or other external checks.
    `,
    responses: {
      204: {
        description: 'Service is up and running',
      },
    },
  };
  handler?: Handler = async (req, res) => {
    return writeResponse(res, HttpStatus.NO_CONTENT);
  };
}
