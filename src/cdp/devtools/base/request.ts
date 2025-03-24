import { z } from 'zod';

export const ProtocolPayloadSchema = z.object({
  id: z.number().optional(),
  sessionId: z.string().optional(),
});

export const ProtocolRequestSchema = ProtocolPayloadSchema.extend({
  method: z.string(),
  params: z.unknown().optional(),
});

export type ProtocolRequest = z.infer<typeof ProtocolRequestSchema>;

export class Request {
  static parse(payload: unknown): ProtocolRequest {
    return ProtocolRequestSchema.parse(payload);
  }
}
