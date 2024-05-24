import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint: 'ws://127.0.0.1:3000',
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
  });

  const title = await page.title();
  console.log(title);

  await browser.close();
}

main().catch(console.error);
