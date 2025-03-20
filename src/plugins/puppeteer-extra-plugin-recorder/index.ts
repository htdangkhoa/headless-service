import type { Page, Frame, Browser } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { env, getBrowserId, patchNamedFunctionESBuildIssue2605 } from '@/utils';
import { ACTIONS as SHARED_ACTIONS, CUSTOM_EVENT_NAME, EXTENSION_TITLE } from '@/constants';
import { Logger } from '@/logger';

export interface IEmbeddedAPIMeta {
  extensionTitle: string;
  actions: typeof SHARED_ACTIONS;
  downloadDir: string;
  customEventName: typeof CUSTOM_EVENT_NAME;
}

export class PuppeteerExtraPluginRecorder extends PuppeteerExtraPlugin {
  private logger = new Logger(this.constructor.name);

  private readonly defaultDownloadDir: string = env('DOWNLOAD_RECORDER_DIR', os.tmpdir())!;

  private downloadDir: string | null = null;

  private pages: Set<Page> = new Set();

  private fsWatcher: fs.FSWatcher | null = null;

  constructor() {
    super();
  }

  get name(): string {
    return 'recorder';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    const browserId = getBrowserId(browser);
    this.logger.info(`Browser ID: ${browserId}`);

    const downloadDir = path.join(this.defaultDownloadDir, browserId);

    this.logger.info(`Download directory: ${downloadDir}`);

    this.downloadDir = downloadDir;

    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    this.fsWatcher = fs.watch(downloadDir, (eventType, filename) => {
      if (eventType === 'rename' && filename?.endsWith('.webm')) {
        this.logger.info(`Event: ${eventType}, Filename: ${filename}`);

        // TODO: Implement adapters for different storage services

        this.cleanupFsWatcher();
      }
    });
  }

  async onPageCreated(page: Page): Promise<void> {
    this.pages.add(page);

    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: this.downloadDir!,
    });

    await patchNamedFunctionESBuildIssue2605(page);

    const self = this;

    page.on('framenavigated', self.onFrameNavigated.bind(self));

    page.on('framedetached', (frame: Frame) => {
      page.off('framenavigated', self.onFrameNavigated);
    });
  }

  async onDisconnected(): Promise<void> {
    this.pages.forEach((page) => {
      if (!page.isClosed()) {
        page.off('framenavigated');
        page.removeAllListeners();
      }
    });

    this.pages.clear();

    this.cleanupFsWatcher();

    this.downloadDir = null;
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
              requestAnimationFrame(() => {
                document.title = originalTitle;
              });
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
        actions: SHARED_ACTIONS,
        downloadDir: this.defaultDownloadDir,
        customEventName: CUSTOM_EVENT_NAME,
      }),
    ]);
  }

  private cleanupFsWatcher() {
    this.fsWatcher?.close();
    this.fsWatcher = null;
  }

  async beforeLaunch(options: any): Promise<void> {
    const args = [
      '--enable-usermedia-screen-capturing',
      '--allow-http-screen-capture',
      '--auto-accept-this-tab-capture',
      `--auto-select-tab-capture-source-by-title=${EXTENSION_TITLE}`,
      '--auto-accept-camera-and-microphone-capture',
      '--auto-grant-captured-surface-control-prompt',
      '--enable-usermedia-screen-capturing',
      `--window-name=${EXTENSION_TITLE}`,
    ];

    options.args.push(...args);
  }
}

const RecorderPlugin = () => new PuppeteerExtraPluginRecorder();

export default RecorderPlugin;
