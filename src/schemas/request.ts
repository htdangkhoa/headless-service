import { z } from 'zod';
import { BooleanOrStringSchema, NumberOrStringSchema } from './common';

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
    stealth: BooleanOrStringSchema.describe(
      'Whether to run the browser in stealth mode'
    ).optional(),
    proxy: z.string().describe('The proxy server to use').optional(),
    block_ads: BooleanOrStringSchema.describe('Whether to block ads').optional(),
    unblock: BooleanOrStringSchema.describe('Whether to bypass the bot detection').optional(),
    request_id: z.string().describe('The request ID').optional(),
  })
  .strict();

export const WSDefaultQuerySchema = RequestDefaultQuerySchema.extend({
  live: BooleanOrStringSchema.describe('Whether to launch the browser in live mode').optional(),
  record: BooleanOrStringSchema.describe('Whether to record the browser').optional(),
}).strict();
