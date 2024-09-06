/* global chrome, MediaRecorder, FileReader */

let desktopMediaRequestId = null;

let recorder = null;

let filename = null;

chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    console.log(msg);
    switch (msg.type) {
      case 'SET_EXPORT_PATH':
        filename = msg.filename;
        break;
      case 'REC_STOP':
        recorder.stop();
        break;
      case 'REC_CLIENT_PLAY':
        if (recorder) {
          return;
        }
        const tab = port.sender.tab;
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
              (stream) => {
                const chunks = [];
                recorder = new MediaRecorder(stream, {
                  videoBitsPerSecond: 2500000,
                  ignoreMutedMedia: true,
                  mimeType: 'video/webm',
                });

                recorder.ondataavailable = function (event) {
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

                  chrome.downloads.download(
                    {
                      url: url,
                      filename: filename,
                    },
                    () => {}
                  );
                };

                recorder.start();
              },
              (error) => console.log('Unable to get user media', error)
            );
          }
        );
        break;
      default:
        console.log('Unrecognized message', msg);
    }
  });

  chrome.downloads.onChanged.addListener(function (delta) {
    if (!delta.state || delta.state.current != 'complete') {
      return;
    }
    try {
      const tab = port.sender.tab;
      chrome.tabs.sendMessage(tab.id, { type: 'DOWNLOAD_COMPLETE' });
      port.postMessage({ downloadComplete: true });
    } catch (e) {}
  });
});
