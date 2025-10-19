import { z } from 'zod';

import { BooleanOrStringSchema, CommaSeparatedStringSchema, NumberOrStringSchema } from './common';
import { UnblockOptionsSchema } from './unblock';

export const RequestTokenQuerySchema = z.object({
  token: z.string().describe('The token to authenticate the request').optional(),
});

export const RequestLaunchQuerySchema = z.object({
  headless: BooleanOrStringSchema.or(z.enum(['shell']))
    .describe('Whether to run the browser in headless mode')
    .optional(),
  args: z.array(z.string()).describe('The additional arguments to pass to the browser').optional(),
  devtools: BooleanOrStringSchema.describe('Whether to run the browser with devtools').optional(),
  slowMo: NumberOrStringSchema.describe('The slow motion value').optional(),
});

export const RequestDefaultQuerySchema = z
  .object({
    launch: RequestLaunchQuerySchema.describe('The launch options for the browser').optional(),
    stealth: z
      .union([z.literal(false), z.enum(['basic', 'advanced']), UnblockOptionsSchema])
      .describe('The stealth mode to use. Defaults to `basic`.')
      .default('basic')
      .optional(),
    proxy: z.string().describe('The proxy server to use').optional(),
    block_ads: BooleanOrStringSchema.describe('Whether to block ads').optional(),
    extensions: CommaSeparatedStringSchema.describe('The names of the extensions').optional(),
    request_id: z.string().describe('The request ID').optional(),
  })
  .strict();

export const RequestDefaultQueryWithTokenSchema = RequestDefaultQuerySchema.extend(
  RequestTokenQuerySchema.shape
);

export const WSDefaultQuerySchema = RequestDefaultQuerySchema.extend({
  record: BooleanOrStringSchema.describe('Record the page with audio').optional(),
}).strict();

export const WSDefaultQueryWithTokenSchema = WSDefaultQuerySchema.extend(
  RequestTokenQuerySchema.shape
);
