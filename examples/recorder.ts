import puppeteer from 'puppeteer-core';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint: 'ws://127.0.0.1:3000/?record=true',
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://www.youtube.com/watch?v=KLuTLF3x9sA', {
    waitUntil: 'load',
  });

  await page.evaluate(() => {
    // @ts-ignore
    window.recorder.start();
  });

  await sleep(5000);

  await page.evaluate(() => {
    // @ts-ignore
    return window.recorder.stop();
  });

  await browser.close();
}

main().catch(console.error);
