import { Maybe } from '../index';

export {} from 'node:http';
export {} from 'node:stream';

declare module 'ws' {
  export interface WebSocket {
    id?: Maybe<string>;
  }
}

declare module 'node:http' {
  export interface IncomingMessage {
    requestId?: Maybe<string>;
  }
}

declare global {
  interface WebSocket {
    id?: Maybe<string>;
    requestId?: Maybe<string>;
  }
}

declare module 'node:stream' {
  export interface Duplex {
    requestId?: Maybe<string>;
  }
}
