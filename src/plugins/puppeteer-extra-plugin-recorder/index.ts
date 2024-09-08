import type { Page, Frame } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import os from 'node:os';
import path from 'node:path';

import { env, getBrowserId, patchNamedFunctionESBuildIssue2605 } from '@/utils';
import { ACTIONS, CUSTOM_EVENT_NAME, EXTENSION_TITLE } from '@/constants';
import { Logger } from '@/logger';

export interface IEmbeddedAPIMeta {
  extensionTitle: string;
  actions: typeof ACTIONS;
  downloadDir: string;
  customEventName: typeof CUSTOM_EVENT_NAME;
}

export class PuppeteerExtraPluginRecorder extends PuppeteerExtraPlugin {
  private logger = new Logger(this.constructor.name);

  private readonly defaultDownloadDir: string = env('DOWNLOAD_RECORDER_DIR', os.tmpdir())!;

  private pages: Set<Page> = new Set();

  constructor() {
    super();
  }

  get name(): string {
    return 'recorder';
  }

  async onPageCreated(page: Page): Promise<void> {
    this.pages.add(page);

    const browser = page.browser();
    const browserId = getBrowserId(browser);

    this.logger.info(`Browser ID: ${browserId}`);

    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: path.join(this.defaultDownloadDir, browserId),
    });

    await patchNamedFunctionESBuildIssue2605(page);

    page.on('framenavigated', this.onFrameNavigated.bind(this));
  }

  async onDisconnected(): Promise<void> {
    this.pages.forEach((page) => {
      if (!page.isClosed()) {
        page.off('framenavigated');
        page.removeAllListeners();
      }
    });
  }

  private async onFrameNavigated(frame: Frame): Promise<void> {
    if (!frame.url().startsWith('http')) return;

    if (frame.page().isClosed()) return;

    if (frame.parentFrame()?.detached) return;

    if (frame.detached) return;

    const setupEmbeddedAPI = (meta: IEmbeddedAPIMeta) => {
      const { extensionTitle, actions, downloadDir, customEventName } = meta;

      if (!window.recorder) {
        Object.defineProperty(window, 'recorder', {
          configurable: false,
          enumerable: false,
          writable: false,
          value: {
            async start() {
              const originalTitle = document.title;
              document.title = extensionTitle;
              window.postMessage(
                {
                  type: actions.REC_START,
                  data: {
                    url: window.location.origin,
                    original_title: originalTitle,
                  },
                },
                '*'
              );
              setTimeout(() => {
                document.title = originalTitle;
              }, 100);
            },
            stop() {
              return new Promise((resolve) => {
                window.postMessage({ type: actions.REC_STOP }, '*');

                window.addEventListener(customEventName, function onDownloadComplete(e) {
                  window.removeEventListener(customEventName, onDownloadComplete);

                  // @ts-ignore
                  const filename = [downloadDir, e.detail].join('/');

                  return resolve(filename);
                });
              });
            },
          },
        });
      }
    };

    await Promise.allSettled([
      frame.waitForNavigation({ timeout: 0 }),
      frame.evaluate(setupEmbeddedAPI, <IEmbeddedAPIMeta>{
        extensionTitle: EXTENSION_TITLE,
        actions: ACTIONS,
        downloadDir: this.defaultDownloadDir,
        customEventName: CUSTOM_EVENT_NAME,
      }),
    ]);
  }
}

const RecorderPlugin = () => new PuppeteerExtraPluginRecorder();

export default RecorderPlugin;
