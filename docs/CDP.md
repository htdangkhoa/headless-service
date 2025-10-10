# The Headless Service CDP API

To make Headless Service compatible with many open source libraries like Puppeteer, Playwright, ...
I decided to use the approach of Chrome DevTools Protocol to extend the features of Headless Service.
Here's a quick list of what it can do:

- Generate and give back live URLs for hybrid automation.
- Tab recording.
- Keep the browser session alive.
- Get debugger URL.
- And more!

Since most libraries come with a way to issue "raw" CDP commands, it's an
easy way to drop-in custom behaviors without having to write and maintain a
library. Plus you can continue to enjoy using the same packages you've
already come to know.

## HeadlessService.liveURL

Gets the live streaming URL for the current session. You can listen to the `HeadlessService.liveComplete` event to know when the live mode is completed.

**Example:**

```typescript
import puppeteer from 'puppeteer-core';

(async () => {
  const TOKEN = '<token>';
  const browserWSEndpoint = '{{wsUrl}}/?token=${TOKEN}';
  const browser = await puppeteer.connect({ browserWSEndpoint });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await page.goto('https://example.com');
  const { liveURL } = await cdp.send('HeadlessService.liveURL');

  // liveURL = `{{baseUrl}}/live?session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJicm93c2VySWQiOiJlYjdlMzA2Ny05ZDNjLTQwZjYtOTFiNi0wZWYwOGYwYzRjMGQiLCJpYXQiOjE3NjAwOTYwMjgsImF1ZCI6WyJodHRwOi8vbG9jYWxob3N0OjMwMDAvbGl2ZSJdLCJpc3MiOiJsb2NhbGhvc3QifQ.7w7QRBEqGxcJR1aPBuFzGj5XU1UcohUT7FhRij_B6Vc`;

  await new Promise<void>((resolve) =>
    cdp.on('HeadlessService.liveComplete', () => {
      return resolve();
    })
  );

  // ... do something after the live mode is completed

  await browser.close();
})();
```

<p align="center">
    <img src="images/live-session.png" alt="Live Session">
</p>

---

## HeadlessService.startRecording

Starts recording the current session.

**Example:**

```typescript
import puppeteer from 'puppeteer-core';

(async () => {
  const TOKEN = '<token>';
  const browserWSEndpoint = '{{wsUrl}}/?token=${TOKEN}&record=true';
  const browser = await puppeteer.connect({ browserWSEndpoint });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await page.goto('https://example.com');
  await cdp.send('HeadlessService.startRecording');
})();
```

---

## HeadlessService.stopRecording

Stops recording the current session.

**Example:**

```typescript
import puppeteer from 'puppeteer-core';

(async () => {
  // ...
  await cdp.send('HeadlessService.stopRecording');
})();
```

---

## HeadlessService.keepAlive

Keeps the browser session alive.

**Example:**

```typescript
import puppeteer from 'puppeteer-core';

(async () => {
  const TOKEN = '<token>';
  const browserWSEndpoint = '{{wsUrl}}/?token=${TOKEN}';
  const browser = await puppeteer.connect({ browserWSEndpoint });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await page.goto('https://example.com');
  const { reconnectUrl } = await cdp.send('HeadlessService.keepAlive', {
    ms: 30000,
  });
})();
```

---

## HeadlessService.debuggerUrl

Gets the debugger URL for the current session.

**Example:**

```typescript
import puppeteer from 'puppeteer-core';

(async () => {
  const TOKEN = '<token>';
  const browserWSEndpoint = '{{wsUrl}}/?token=${TOKEN}';
  const browser = await puppeteer.connect({ browserWSEndpoint });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await page.goto('https://example.com');
  const { webSocketDebuggerUrl, devtoolsFrontendUrl } = await cdp.send(
    'HeadlessService.debuggerUrl'
  );

  // webSocketDebuggerUrl = `{{baseUrl}}/devtools/page/B9FB4CB53702ABDF73347C04B7EF1E14?token=${TOKEN}`;
  // devtoolsFrontendUrl = `{{baseUrl}}/devtools/inspector.html?ws=localhost%3A3000%2Fdevtools%2Fpage%2FB9FB4CB53702ABDF73347C04B7EF1E14?token=${TOKEN}`;
})();
```
