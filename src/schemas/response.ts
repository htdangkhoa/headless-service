import { z } from 'zod';

export const ResponseBodySchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.unknown()).optional(),
});

export type ResponseBody = z.infer<typeof ResponseBodySchema>;
