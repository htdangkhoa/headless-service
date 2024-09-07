import type { Page, Frame } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import os from 'node:os';

import { env, patchNamedFunctionESBuildIssue2605, sleep } from '@/utils';
import { CUSTOM_EVENT_NAMES, EXTENSION_TITLE, RECORDER_ACTIONS } from '@/constants';

export interface IEmbeddedAPIMeta {
  extensionTitle: string;
  actions: typeof RECORDER_ACTIONS;
  downloadDir: string;
  customEventNames: typeof CUSTOM_EVENT_NAMES;
}

export class PuppeteerExtraPluginRecorder extends PuppeteerExtraPlugin {
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

    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: this.defaultDownloadDir,
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
      const { extensionTitle, actions, downloadDir, customEventNames } = meta;

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
                  type: actions.REC_CLIENT_PLAY,
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

                window.addEventListener(
                  customEventNames.DOWNLOAD_COMPLETE,
                  function onDownloadComplete(e) {
                    window.removeEventListener(
                      customEventNames.DOWNLOAD_COMPLETE,
                      onDownloadComplete
                    );

                    // @ts-ignore
                    const filename = [downloadDir, e.detail].join('/');

                    return resolve(filename);
                  }
                );
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
        actions: RECORDER_ACTIONS,
        downloadDir: this.defaultDownloadDir,
        customEventNames: CUSTOM_EVENT_NAMES,
      }),
    ]);
  }
}

const RecorderPlugin = () => new PuppeteerExtraPluginRecorder();

export default RecorderPlugin;
