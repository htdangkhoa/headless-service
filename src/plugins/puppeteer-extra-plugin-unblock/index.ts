import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import type { Frame, Page } from 'puppeteer';
import {
  FingerprintGenerator,
  BrowserFingerprintWithHeaders,
  FingerprintGeneratorOptions,
} from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';

import { patchNamedFunctionESBuildIssue2605 } from '@/utils';

export interface UnblockOptions {
  fingerprint?: BrowserFingerprintWithHeaders;
  fingerprintOptions?: Partial<FingerprintGeneratorOptions>;
}

export class PuppeteerExtraPluginUnblock extends PuppeteerExtraPlugin {
  private generator = new FingerprintGenerator();
  private injector = new FingerprintInjector();

  private fingerprintWithHeaders: BrowserFingerprintWithHeaders | null = null;

  constructor(protected options?: UnblockOptions) {
    super();
  }

  get name(): string {
    return 'unblock';
  }

  async onPageCreated(page: Page): Promise<void> {
    await patchNamedFunctionESBuildIssue2605(page);

    const fingerprintWithHeaders =
      this.options?.fingerprint ??
      this.generator.getFingerprint(this.options?.fingerprintOptions ?? {});
    this.fingerprintWithHeaders = fingerprintWithHeaders;

    if (page.isClosed()) return;

    const self = this;

    page.on('framenavigated', self.onFrameNavigated.bind(self));

    page.on('framedetached', (frame: Frame) => {
      page.off('framenavigated', self.onFrameNavigated);
    });
  }

  async onFrameNavigated(frame: Frame): Promise<void> {
    if (!this.fingerprintWithHeaders) return;

    if (frame.detached) return;

    if (frame.parentFrame()?.detached) return;

    const page = frame.page();

    if (!page) return;

    if (!page.isClosed()) return;

    await this.injector.attachFingerprintToPuppeteer(page, this.fingerprintWithHeaders);
  }

  async beforeLaunch(options: any): Promise<void> {
    const args = options.args.filter((arg: string) => !arg.includes('disable-gpu'));

    const idx = args.findIndex((arg: string) => arg.startsWith('--disable-blink-features='));

    if (idx !== -1) {
      const arg = args[idx];
      args[idx] = `${arg},AutomationControlled`;
    } else {
      args.push('--disable-blink-features=AutomationControlled');
    }

    options.args = args;
  }
}

const UnblockPlugin = (options?: UnblockOptions) => new PuppeteerExtraPluginUnblock(options);

export default UnblockPlugin;
