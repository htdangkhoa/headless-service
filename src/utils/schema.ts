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
    .optional()
    .describe('Whether to run the browser in headless mode'),
});

export const ResponseBodySchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.unknown()).optional(),
});

export type ResponseBody = z.infer<typeof ResponseBodySchema>;
