/* global chrome, MediaRecorder, FileReader */

import { ACTIONS, CUSTOM_EVENT_NAME } from '../../constants/recorder';

export {};

declare global {
  interface Navigator {
    webkitGetUserMedia: any;
  }
}

/// <reference types="chrome"/>

let desktopMediaRequestId: number | null = null;

let recorder: any = null;

chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    console.log(msg);
    switch (msg.type) {
      case ACTIONS.REC_STOP:
        recorder.stop();
        break;
      case ACTIONS.REC_START:
        if (recorder) {
          return;
        }
        const tab = port.sender!.tab!;
        tab.url = msg.data.url;
        desktopMediaRequestId = chrome.desktopCapture.chooseDesktopMedia(
          ['tab', 'audio'],
          (streamId) => {
            // Get the stream
            navigator.webkitGetUserMedia(
              {
                // audio: false,
                audio: {
                  mandatory: {
                    chromeMediaSource: 'system',
                  },
                },
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId,
                    minWidth: 1280,
                    maxWidth: 1280,
                    minHeight: 720,
                    maxHeight: 720,
                    minFrameRate: 60,
                  },
                },
              },
              (stream: any) => {
                const chunks: any[] = [];
                recorder = new MediaRecorder(stream, {
                  videoBitsPerSecond: 2500000,
                  // @ts-ignore
                  ignoreMutedMedia: true,
                  mimeType: 'video/webm',
                });

                recorder.ondataavailable = function (event: any) {
                  if (event.data.size > 0) {
                    chunks.push(event.data);
                  }
                };

                recorder.onstop = function () {
                  const tracks = stream.getTracks();

                  for (let i = 0; i < tracks.length; i += 1) {
                    tracks[i].stop();
                  }

                  if (desktopMediaRequestId) {
                    chrome.desktopCapture.cancelChooseDesktopMedia(desktopMediaRequestId);
                  }

                  const superBuffer = new Blob(chunks, {
                    type: 'video/webm',
                  });

                  const url = URL.createObjectURL(superBuffer);

                  chrome.downloads.download({ url: url });
                };

                recorder.start();
              },
              (error: any) => console.log('Unable to get user media', error)
            );
          }
        );
        break;
      default:
        console.log('Unrecognized message', msg);
    }
  });

  let blobUrl: string | null = null;

  function onDownloadCreated(item: chrome.downloads.DownloadItem) {
    blobUrl = item.finalUrl;
  }

  if (!chrome.downloads.onCreated.hasListener(onDownloadCreated)) {
    chrome.downloads.onCreated.addListener(onDownloadCreated);
  }

  function onDownloadChanged(delta: chrome.downloads.DownloadDelta) {
    if (!delta.state || delta.state.current != 'complete') {
      return;
    }
    try {
      let filename;
      if (blobUrl) {
        const url = new URL(blobUrl);
        filename = url.pathname.split('/').pop()!.concat('.webm');
      }
      const tab = port.sender!.tab!;
      chrome.tabs.sendMessage(tab.id!, { type: CUSTOM_EVENT_NAME, data: filename });
      port.postMessage({ downloadComplete: true });
    } catch (e) {}
  }

  if (!chrome.downloads.onChanged.hasListener(onDownloadChanged)) {
    chrome.downloads.onChanged.addListener(onDownloadChanged);
  }
});
