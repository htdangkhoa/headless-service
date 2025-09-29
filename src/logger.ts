import debug from 'debug';

import { RequestIdContext } from './request-id-context';
import { env } from './utils';

export class Logger {
  private serviceName = env('SERVICE_NAME');

  private readonly requestIdContext = RequestIdContext.getInstance();

  private _trace: (...args: unknown[]) => void;
  private _debug: (...args: unknown[]) => void;
  private _info: (...args: unknown[]) => void;
  private _warn: (...args: unknown[]) => void;
  private _error: (...args: unknown[]) => void;
  private _fatal: (...args: unknown[]) => void;

  constructor(domain?: string) {
    let fullDomain = [this.serviceName, domain].filter(Boolean).join(':');

    const logger = debug(fullDomain);

    this._trace = logger.extend('trace');
    this._debug = logger.extend('debug');
    this._info = logger.extend('info');
    this._warn = logger.extend('warn');
    this._error = logger.extend('error');
    this._fatal = logger.extend('fatal');
  }

  private requestId() {
    const id = this.requestIdContext.getStore()?.requestId;
    return !id ? '[undefined]' : id;
  }

  trace(...args: unknown[]) {
    return this._trace(this.requestId(), ...args);
  }

  debug(...args: unknown[]) {
    return this._debug(this.requestId(), ...args);
  }

  info(...args: unknown[]) {
    return this._info(this.requestId(), ...args);
  }

  warn(...args: unknown[]) {
    return this._warn(this.requestId(), ...args);
  }

  error(...args: unknown[]) {
    return this._error(this.requestId(), ...args);
  }

  fatal(...args: unknown[]) {
    return this._fatal(this.requestId(), ...args);
  }
}
