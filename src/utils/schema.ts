import { z } from 'zod';

export const BooleanOrStringSchema = z.boolean().or(
  z
    .string()
    .refine((value) => value === 'true' || value === 'false', {
      message: 'Value must be a boolean',
    })
    .transform((value) => value === 'true')
);

export const NumberOrStringSchema = z.number().or(
  z
    .string()
    .refine((value) => !Number.isNaN(Number(value)), {
      message: 'Value must be a number',
    })
    .transform((value) => Number(value))
);

export const ResponseBodySchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.unknown()).optional(),
});

export type ResponseBody = z.infer<typeof ResponseBodySchema>;
