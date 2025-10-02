chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Activated tabId:', activeInfo.tabId);

  chrome.scripting.executeScript({
    target: { tabId: activeInfo.tabId },
    func: () => {
      // console.log(
      //   '@@tabs-management@@',
      //   document.getElementById('page-id')?.getAttribute('content')
      // );
      const pageId = document.getElementById('page-id')?.getAttribute('content');
      // return pageId;
      chrome.runtime.sendMessage({
        type: 'activated',
        data: {
          pageId,
          // tabId: activeInfo.tabId,
        },
      });
    },
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Tab loaded:', tabId, tab.url);

    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        function hackAnchor() {
          document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((a) => {
            a.removeAttribute('target');

            a.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              window.location.href = a.href;
            });
          });
        }
        window.hackAnchor = hackAnchor;

        hackAnchor();

        setInterval(hackAnchor, 10);
      },
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'activated') {
    console.log('activated', message.data);
  }
});
