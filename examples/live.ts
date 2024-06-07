import puppeteer from 'puppeteer-core';

async function main() {
  const browserWSURL = new URL('ws://127.0.0.1:3000');
  browserWSURL.searchParams.set('live', 'true');

  const browserWSEndpoint = browserWSURL.href;

  const browser = await puppeteer.connect({
    browserWSEndpoint,
  });

  const page = await browser.newPage();
  const liveURL = await page.evaluate(() => {
    return (window as any).liveURL();
  });
  console.log('🚀 ~ liveURL ~ liveURL:', liveURL);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://youtube.com', {
    waitUntil: 'domcontentloaded',
  });

  const title = await page.title();
  console.log(title);

  await new Promise((resolve) => page.exposeFunction('liveComplete', resolve));

  const page2 = await browser.newPage();
  await page2.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
  });
  console.log(await page2.title());

  const description = await page.evaluate(() => {
    return document.querySelector('meta[name="description"]')?.getAttribute('content');
  });

  console.log(description);

  await browser.close();
}

main().catch(console.error);
