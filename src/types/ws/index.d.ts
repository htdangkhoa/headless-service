import { Maybe } from '..';

export {} from 'node:http';
export {} from 'node:stream';

declare module 'node:http' {
  export interface IncomingMessage {
    requestId?: Maybe<string>;
  }
}

declare global {
  interface WebSocket {
    requestId?: Maybe<string>;
  }
}

declare module 'node:stream' {
  export interface Duplex {
    requestId?: Maybe<string>;
  }
}
