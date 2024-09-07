import {} from 'puppeteer';

declare global {
  interface Window {
    recorder: {
      start(): void;
      stop(): string;
    };
  }
}
