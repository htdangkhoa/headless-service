import puppeteer from 'puppeteer-core';

const browserWSURL = new URL('ws://127.0.0.1:3000');
browserWSURL.searchParams.set('token', '<token>');
browserWSURL.searchParams.set('launch[headless]', 'false');
const browserWSEndpoint = browserWSURL.href;

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint,
  });

  const page = await browser.newPage();

  const cdp = await page.createCDPSession();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
  });

  const title = await page.title();
  console.log(title);

  // @ts-ignore
  const { reconnectUrl } = await cdp.send('HeadlessService.keepAlive', {
    ms: 30000,
  });
  console.log('🚀 ~ main ~ reconnectUrl:', reconnectUrl);

  await browser.disconnect();

  // Reconnect
  const browser2 = await puppeteer.connect({
    browserWSEndpoint: reconnectUrl.replace('localhost', '127.0.0.1'),
  });

  const [currentPage] = await browser2.pages();
  console.log(await currentPage.title());

  await browser2.close();
}

main().catch(console.error);
