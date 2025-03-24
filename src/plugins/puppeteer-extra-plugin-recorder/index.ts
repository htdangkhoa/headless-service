import type { Browser } from 'puppeteer';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { buildProtocolEventNames, buildProtocolMethod, env, getBrowserId } from '@/utils';
import { ACTIONS as SHARED_ACTIONS, EXTENSION_TITLE, DOMAINS, COMMANDS } from '@/constants';
import { Logger } from '@/logger';
import { ValueOf } from '@/types';
import { Request, Response } from '@/cdp/devtools';

interface RecordingParams {
  action: ValueOf<typeof SHARED_ACTIONS>;
}
interface StartRecordingParams extends RecordingParams {
  originalTitle: string;
}

interface StopRecordingParams extends RecordingParams {}

export class PuppeteerExtraPluginRecorder extends PuppeteerExtraPlugin {
  private logger = new Logger(this.constructor.name);

  private readonly defaultDownloadDir: string = env('DOWNLOAD_RECORDER_DIR', os.tmpdir())!;

  private browser: Browser | null = null;

  private readonly downloadDirMap: Map<string, string> = new Map();

  private readonly PROTOCOL_METHODS = {
    START_RECORDING: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.START_RECORDING),
    STOP_RECORDING: buildProtocolMethod(DOMAINS.HEADLESS_SERVICE, COMMANDS.STOP_RECORDING),
  };

  constructor() {
    super();
  }

  get name(): string {
    return 'recorder';
  }

  async onBrowser(browser: Browser, opts: any): Promise<void> {
    this.browser = browser;

    const browserId = getBrowserId(browser);

    const { eventNameForListener: eventNameForStartRecordingListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.START_RECORDING
    );

    browser.on(eventNameForStartRecordingListener, this.onStartRecording.bind(this));

    const { eventNameForListener: eventNameForStopRecordingListener } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.STOP_RECORDING
    );

    browser.on(eventNameForStopRecordingListener, this.onStopRecording.bind(this));
  }

  async onDisconnected(): Promise<void> {
    this.browser = null;
    this.downloadDirMap.clear();
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

  private async onStartRecording(payload: any) {
    const request = Request.parse(payload);

    if (!this.browser) return;

    const currentPage = await this.browser.currentPage();

    if (!currentPage) return;

    const browserId = getBrowserId(this.browser);

    const cdp = await currentPage.createCDPSession();

    const {
      targetInfo: { targetId },
    } = await cdp.send('Target.getTargetInfo');

    const downloadDir = path.join(this.defaultDownloadDir, browserId, targetId);

    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });

    this.downloadDirMap.set(targetId, downloadDir);

    this.logger.info(`Download directory: ${downloadDir}`);

    const originalTitle = await currentPage.title();

    await currentPage.evaluate((extensionTitle: string) => {
      document.title = extensionTitle;
    }, EXTENSION_TITLE);

    await currentPage.evaluate(
      ({ action, originalTitle }: StartRecordingParams) => {
        window.postMessage(
          {
            type: action,
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
      <StartRecordingParams>{
        action: SHARED_ACTIONS.REC_START,
        originalTitle,
      }
    );

    const response = Response.success(request.id!, {}, request.sessionId);

    const { eventNameForResult } = buildProtocolEventNames(
      browserId,
      this.PROTOCOL_METHODS.START_RECORDING
    );

    return this.browser.emit(eventNameForResult, response);
  }

  private async onStopRecording(payload: any) {
    const request = Request.parse(payload);

    if (!this.browser) return;

    const currentPage = await this.browser.currentPage();

    if (!currentPage) return;

    const cdp = await currentPage.createCDPSession();

    const {
      targetInfo: { targetId },
    } = await cdp.send('Target.getTargetInfo');

    const downloadDir = this.downloadDirMap.get(targetId);

    if (!downloadDir) return;

    const fsWatcher = fs.watch(downloadDir, (eventType, filename) => {
      if (eventType === 'rename' && filename?.endsWith('.webm')) {
        this.logger.info(`Event: ${eventType}, Filename: ${filename}`);

        // TODO: Implement adapters for different storage services

        fsWatcher.close();

        this.downloadDirMap.delete(targetId);

        const browserId = getBrowserId(this.browser!);

        const response = Response.success(request.id!, {}, request.sessionId);

        const { eventNameForResult } = buildProtocolEventNames(
          browserId,
          this.PROTOCOL_METHODS.STOP_RECORDING
        );

        return this.browser!.emit(eventNameForResult, response);
      }
    });

    await currentPage.evaluate(
      ({ action }: StopRecordingParams) => {
        window.postMessage({ type: action }, '*');
      },
      <StopRecordingParams>{
        action: SHARED_ACTIONS.REC_STOP,
      }
    );
  }
}

const RecorderPlugin = () => new PuppeteerExtraPluginRecorder();

export default RecorderPlugin;
