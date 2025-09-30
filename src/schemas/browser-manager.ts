import { z } from 'zod';

export const BrowserSessionSchema = z.object({
  browserId: z.string(),
  killUrl: z.string(),
  userDataDir: z.string().nullable().optional(),
});

export type IBrowserSession = z.infer<typeof BrowserSessionSchema>;
