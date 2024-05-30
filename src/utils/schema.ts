import { z } from 'zod';

export const BooleanOrStringSchema = z
  .boolean()
  .or(z.enum(['true', 'false']).transform((value) => value === 'true'));

export const NumberOrStringSchema = z.number().or(
  z
    .string()
    .refine((value) => !Number.isNaN(Number(value)), {
      message: 'Value must be a number',
    })
    .transform((value) => Number(value))
);

export const RequestLaunchQuerySchema = z.object({
  headless: BooleanOrStringSchema.or(z.enum(['shell']))
    .describe('Whether to run the browser in headless mode')
    .optional(),
  args: z.array(z.string()).describe('The additional arguments to pass to the browser').optional(),
  devtools: BooleanOrStringSchema.describe('Whether to run the browser with devtools').optional(),
  slowMo: NumberOrStringSchema.describe('The slow motion value').optional(),
  stealth: BooleanOrStringSchema.describe('Whether to run the browser in stealth mode').optional(),
  proxy: z.string().describe('The proxy server to use').optional(),
  block_ads: BooleanOrStringSchema.describe('Whether to block ads').optional(),
});

export const RequestDefaultQuerySchema = z
  .object({
    launch: RequestLaunchQuerySchema.describe('The launch options for the browser').optional(),
  })
  .strict();

export const ResponseBodySchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.unknown()).optional(),
});

export type ResponseBody = z.infer<typeof ResponseBodySchema>;
