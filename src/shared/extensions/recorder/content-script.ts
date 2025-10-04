import { DEFAULT_SAMPLE_RATE, ACTIONS as INTERNAL_ACTIONS } from './constants';

/// <reference types="chrome"/>

export {};

declare global {
  interface Window {
    recorderInjected: boolean;
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, response) {
  console.log('🚀 ~ msg:', msg);
  switch (msg.type) {
    case INTERNAL_ACTIONS.START_RECORDING: {
      return startRecording(msg.data);
    }
    case INTERNAL_ACTIONS.STOP_RECORDING: {
      return stopRecording();
    }
    case INTERNAL_ACTIONS.COMPLETE_DOWNLOAD: {
      const { eventName, filename } = msg.data;
      const e = new CustomEvent(eventName, {
        detail: filename,
      });
      window.dispatchEvent(e);
      break;
    }
  }
});

window.onload = () => {
  if (window.recorderInjected) return;
  Object.defineProperty(window, 'recorderInjected', { value: true, writable: false });

  // Setup message passing
  const port = chrome.runtime.connect(chrome.runtime.id);

  port.onMessage.addListener((msg) => window.postMessage(msg, '*'));

  window.addEventListener('message', (event) => {
    // Relay client messages
    if (event.source === window && event.data.type) {
      port.postMessage(event.data);
    }
  });
};

let recorder: MediaRecorder | undefined;
let data: BlobPart[] = [];

async function startRecording(streamId: string) {
  if (recorder?.state === 'recording') {
    throw new Error('Called startRecording while recording is in progress.');
  }

  const media = await navigator.mediaDevices.getDisplayMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: DEFAULT_SAMPLE_RATE,
    },
    video: true,
    // @ts-ignore
    preferCurrentTab: true,
  });

  const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  audioStream.getTracks().forEach((track) => {
    media.addTrack(track);
  });

  // Start recording.
  recorder = new MediaRecorder(media, { mimeType: 'video/webm' });
  recorder.ondataavailable = (event) => data.push(event.data);
  recorder.onstop = () => {
    const blob = new Blob(data, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);

    window.postMessage({ type: INTERNAL_ACTIONS.BEGIN_DOWNLOAD, data: url }, '*');

    // Clear state ready for next recording
    recorder = undefined;
    data = [];
  };
  recorder.start();
}

function stopRecording() {
  if (recorder) {
    recorder.stop();

    // Stopping the tracks makes sure the recording icon in the tab is removed.
    recorder.stream.getTracks().forEach((t) => t.stop());
  }
}
