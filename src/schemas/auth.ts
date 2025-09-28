import { z } from 'zod';

export const AuthSchema = z.object({
  token: z.string().describe('The token to authenticate the request').optional(),
});
