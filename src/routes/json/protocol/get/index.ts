import type { Handler } from 'express';
import dedent from 'dedent';
import { z } from 'zod';

import { Method, ProxyHttpRoute } from '@/router';
import { HttpStatus, OPENAPI_TAGS } from '@/constants';
import { ResponseBodySchema as ResponseDefaultBodySchema } from '@/schemas';
import { writeResponse } from '@/utils';

const DevToolsProtocolSchema = z.object({
  version: z.object({
    major: z.number().describe('The major version number.'),
    minor: z.number().describe('The minor version number.'),
  }),
  domains: z
    .array(
      z.object({
        domain: z.string().describe('The domain name.'),
        experimental: z.boolean().describe('Whether the domain is experimental.'),
        deprecated: z.boolean().describe('Whether the domain is deprecated.'),
        dependencies: z.array(z.string()).describe('The list of dependencies.'),
        types: z.array(
          z.object({
            id: z.string().describe('The type ID.'),
            type: z.string().describe('The type.'),
            description: z.string().describe('The description of the type.'),
          })
        ),
        commands: z.array(
          z.object({
            name: z.string().describe('The command name.'),
            description: z.string().describe('The description of the command.'),
            experimental: z.boolean().describe('Whether the command is experimental.'),
            deprecated: z.boolean().describe('Whether the command is deprecated.'),
            parameters: z.array(
              z.object({
                name: z.string().describe('The parameter name.'),
                type: z.string().describe('The parameter type.'),
                description: z.string().describe('The description of the parameter.'),
                optional: z.boolean().describe('Whether the parameter is optional.'),
              })
            ),
            returns: z.array(
              z.object({
                name: z.string().describe('The return name.'),
                type: z.string().describe('The return type.'),
                description: z.string().describe('The description of the return.'),
              })
            ),
          })
        ),
        events: z.array(
          z.object({
            name: z.string().describe('The event name.'),
            description: z.string().describe('The description of the event.'),
            experimental: z.boolean().describe('Whether the event is experimental.'),
            deprecated: z.boolean().describe('Whether the event is deprecated.'),
            parameters: z.array(
              z.object({
                name: z.string().describe('The parameter name.'),
                type: z.string().describe('The parameter type.'),
                description: z.string().describe('The description of the parameter.'),
              })
            ),
          })
        ),
      })
    )
    .describe('The list of supported domains.'),
});

export class JSONProtocolGetRoute extends ProxyHttpRoute {
  method = Method.GET;
  path = '/protocol';
  swagger = {
    tags: [OPENAPI_TAGS.REST_APIS],
    summary: this.path,
    description: dedent`
      Returns a JSON payload that acts as a pass-through to the DevTools /json/version protocol in Browser.
    `,
    responses: {
      200: {
        description: 'The performance data',
        content: {
          'application/json': {
            schema: DevToolsProtocolSchema,
          },
        },
      },
      500: {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: ResponseDefaultBodySchema.omit({ data: true }),
          },
        },
      },
    },
  };
  handler: Handler = async (req, res) => {
    const { browserManager } = this.context;

    const meta = await browserManager.getJSONProtocol();

    return writeResponse(res, HttpStatus.OK, {
      body: meta,
      skipValidateBody: true,
    });
  };
}
