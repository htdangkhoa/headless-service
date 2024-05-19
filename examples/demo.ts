import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint: 'ws://127.0.0.1:3000?token=123456',
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

  // await browser.close();
}

main().catch(console.error);
