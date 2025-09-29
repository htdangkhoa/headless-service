import { AsyncLocalStorage } from 'node:async_hooks';

import type { Maybe } from './types';

export class RequestIdContext extends AsyncLocalStorage<{ requestId: Maybe<string> }> {
  private static instance: RequestIdContext;

  static getInstance() {
    if (!this.instance) {
      this.instance = new RequestIdContext();
    }

    return this.instance;
  }
}
