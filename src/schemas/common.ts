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
