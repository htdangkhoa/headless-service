import lighthouse, { Flags, Config } from 'lighthouse';

import { Dictionary } from '@/types';

export enum Events {
  INIT = 'init',
  START = 'start',
  COMPLETE = 'complete',
  ERROR = 'error',
}

export interface IChildProcessInput {
  event: Events;
  browserWSEndpoint: string;
  payload: {
    url: string;
    config?: Dictionary<any>;
  };
}

export interface IChildProcessOutput {
  event: Events;
  data?: unknown;
  error?: Error;
}

const send = (msg: any) => process.send?.(msg);

const start = async (message: IChildProcessInput) => {
  const { browserWSEndpoint, payload } = message;
  const { url, config } = payload;

  const port = Number(new URL(browserWSEndpoint).port);

  const lighthouseFlags: Flags = {
    port,
    logLevel: 'info',
    output: 'json',
  };

  try {
    const result = await lighthouse(url, lighthouseFlags, config as Config);

    const output: IChildProcessOutput = {
      event: Events.COMPLETE,
      data: result?.lhr,
    };

    send(output);
  } catch (error) {
    const output: IChildProcessOutput = {
      event: Events.ERROR,
      error: error as Error,
    };
    send(output);
  }
};

process.on('message', async (message: IChildProcessInput) => {
  const { event } = message;

  if (event !== Events.START) {
    return;
  }

  return start(message);
});

send({ event: Events.INIT });
