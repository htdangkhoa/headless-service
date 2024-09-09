export {};

declare global {
  interface Window {
    recorderInjected: boolean;
  }
}

/// <reference types="chrome"/>

chrome.runtime.onMessage.addListener(function (msg, sender, response) {
  const e = new CustomEvent(msg.type, {
    detail: msg.data,
  });
  window.dispatchEvent(e);
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
