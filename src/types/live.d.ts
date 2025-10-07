import { ProtocolMapping } from 'devtools-protocol/types/protocol-mapping';

import { Dictionary } from './index.d';

export interface LiveContext {
  sessionId: string;
  connectionId: string;
}

export interface LiveMessage<T extends Dictionary = Dictionary> {
  context: LiveContext;
  command: string;
  /**
   * Used for client to server communication
   */
  params?: T;
  /**
   * Used for server to client communication
   */
  data?: T;
}
