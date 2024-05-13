import { env } from './env';

export const makeExternalUrl = (...parts: string[]) => {
  const externalAddress = env('EXTERNAL_ADDRESS')!;

  const externalAddressURL = new URL(externalAddress);

  return new URL(parts.join('/'), externalAddressURL).href;
};
