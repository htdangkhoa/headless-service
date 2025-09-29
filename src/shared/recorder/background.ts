/// <reference types="chrome"/>

/* global chrome, MediaRecorder, FileReader */

import { CUSTOM_EVENT_NAME, ACTIONS as SHARED_ACTIONS } from '../../constants/recorder';
import { ACTIONS as INTERNAL_ACTIONS } from './constants';

export {};

declare global {
  interface Navigator {
    webkitGetUserMedia: any;
  }
}

let desktopMediaRequestId: number | null = null;

chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    console.log(msg);

    const tab = port.sender!.tab!;

    switch (msg.type) {
      case SHARED_ACTIONS.REC_START: {
        desktopMediaRequestId = chrome.desktopCapture.chooseDesktopMedia(
          ['tab', 'audio'],
          tab,
          (streamId) => {
            chrome.tabs.sendMessage(tab.id!, {
              type: INTERNAL_ACTIONS.START_RECORDING,
              data: streamId,
            });
          }
        );

        break;
      }
      case SHARED_ACTIONS.REC_STOP: {
        if (typeof desktopMediaRequestId === 'number') {
          chrome.desktopCapture.cancelChooseDesktopMedia(desktopMediaRequestId!);
          desktopMediaRequestId = null;
        }

        chrome.tabs.sendMessage(tab.id!, { type: INTERNAL_ACTIONS.STOP_RECORDING });
      }
      case INTERNAL_ACTIONS.BEGIN_DOWNLOAD: {
        console.log('Download begin', msg.data);

        chrome.downloads.download({ url: msg.data });
        break;
      }
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
      chrome.tabs.sendMessage(tab.id!, {
        type: INTERNAL_ACTIONS.COMPLETE_DOWNLOAD,
        data: {
          eventName: CUSTOM_EVENT_NAME,
          filename,
        },
      });
      port.postMessage({ downloadComplete: true });
    } catch {}
  }

  if (!chrome.downloads.onChanged.hasListener(onDownloadChanged)) {
    chrome.downloads.onChanged.addListener(onDownloadChanged);
  }
});
