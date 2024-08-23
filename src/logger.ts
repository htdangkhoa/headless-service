import { BaseLogger } from 'tslog';
import { env } from './utils';

export enum LogLevel {
  SILLY,
  TRACE,
  DEBUG,
  INFO,
  WARN,
  ERROR,
  FATAL,
}

export class Logger {
  private serviceName = env('SERVICE_NAME');

  private readonly instance = new BaseLogger({ name: this.serviceName });

  private logger = this.instance;

  constructor(domain?: string) {
    if (domain) {
      this.logger = this.instance.getSubLogger({ name: domain });
    }
  }

  silly(...args: unknown[]) {
    return this.logger.log(LogLevel.SILLY, LogLevel[LogLevel.SILLY], ...args);
  }

  trace(...args: unknown[]) {
    return this.logger.log(LogLevel.TRACE, LogLevel[LogLevel.TRACE], ...args);
  }

  debug(...args: unknown[]) {
    return this.logger.log(LogLevel.DEBUG, LogLevel[LogLevel.DEBUG], ...args);
  }

  info(...args: unknown[]) {
    return this.logger.log(LogLevel.INFO, LogLevel[LogLevel.INFO], ...args);
  }

  warn(...args: unknown[]) {
    return this.logger.log(LogLevel.WARN, LogLevel[LogLevel.WARN], ...args);
  }

  error(...args: unknown[]) {
    return this.logger.log(LogLevel.ERROR, LogLevel[LogLevel.ERROR], ...args);
  }

  fatal(...args: unknown[]) {
    return this.logger.log(LogLevel.FATAL, LogLevel[LogLevel.FATAL], ...args);
  }
}
