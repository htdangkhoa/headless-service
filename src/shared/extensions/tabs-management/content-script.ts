let pageId = document.getElementById('page-id');
if (!pageId) {
  pageId = document.createElement('meta');
  pageId.id = 'page-id';
  const id = window.crypto.randomUUID();
  pageId.setAttribute('property', 'page-id');
  pageId.setAttribute('content', id);
  document.head.appendChild(pageId);
}

window.addEventListener('focus', () => {
  console.log('Tab is focused:', window.location.href);
});

window.addEventListener('blur', () => {
  console.log('Tab lost focus:', window.location.href);
});

// function hackAnchor() {
//   document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((a) => {
//     a.removeAttribute('target');

//     a.addEventListener('click', (e) => {
//       e.preventDefault();
//       e.stopPropagation();
//       e.stopImmediatePropagation();
//       window.location.href = a.href;
//     });
//   });
// }

// setInterval(hackAnchor, 10);

// window.hackAnchor = hackAnchor;
