chrome.runtime.onMessage.addListener(function (msg, sender, response) {
  console.log('🚀 ~ msg:', msg);
  switch (msg.type) {
    case 'DOWNLOAD_COMPLETE':
      const e = new CustomEvent('DOWNLOAD_COMPLETE');
      window.dispatchEvent(e);
      break;
    default:
      console.warn('Unrecognized message', msg);

      break;
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
    if (event.data.type === 'PLAYBACK_COMPLETE') {
      port.postMessage({ type: 'REC_STOP' }, '*');
    }
    if (event.data.downloadComplete) {
      document.querySelector('html').classList.add('downloadComplete');
    }
  });
};
