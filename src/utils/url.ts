import { IncomingMessage } from 'node:http';

import { env } from './env';

export const makeExternalUrl = (protocol: 'http' | 'ws', ...parts: string[]) => {
  const externalAddress = env('EXTERNAL_ADDRESS')!;

  const externalAddressURL = new URL(externalAddress);

  return new URL(parts.join('/'), externalAddressURL).href
    .replace(/\/$/, '')
    .replace(/^http/, protocol);
};

export const parseUrlFromIncomingMessage = (req: IncomingMessage) => {
  return new URL(req.url!, `http://${req.headers.host}`);
};
