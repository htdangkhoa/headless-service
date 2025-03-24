import { z } from 'zod';
import { ProtocolPayloadSchema } from './request';
import { DispatchResponse } from './dispatch';

export const ProtocolResponseSchema = ProtocolPayloadSchema.extend({
  id: z.number(),
  result: z.unknown().optional(),
});

export type ProtocolResponse = z.infer<typeof ProtocolResponseSchema>;

export const ProtocolErrorResponseSchema = ProtocolResponseSchema.extend({
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

export type ProtocolErrorResponse = z.infer<typeof ProtocolErrorResponseSchema>;

export class Response {
  static success(id: number, result: unknown, sessionId?: string) {
    return ProtocolResponseSchema.parse({
      id,
      sessionId,
      result,
    });
  }

  static error(id: number, dispatchResponse: DispatchResponse, sessionId?: string) {
    return ProtocolErrorResponseSchema.parse({
      id,
      sessionId,
      error: {
        code: dispatchResponse.code,
        message: dispatchResponse.message,
      },
    });
  }
}
