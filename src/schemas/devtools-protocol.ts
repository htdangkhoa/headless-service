import { z } from 'zod';

export const ProtocolSchema = z.object({
  id: z.number(),
  sessionId: z.string(),
});

export type Protocol = z.infer<typeof ProtocolSchema>;

export const ProtocolRequestSchema = ProtocolSchema.extend({
  method: z.string(),
});

export type ProtocolRequest = z.infer<typeof ProtocolRequestSchema>;

export const ProtocolResponseSchema = ProtocolSchema.extend({});

export type ProtocolResponse = z.infer<typeof ProtocolResponseSchema>;

export const ProtocolErrorSchema = ProtocolSchema.extend({
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;
