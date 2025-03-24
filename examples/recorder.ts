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

  const cdp = await page.createCDPSession();

  // @ts-expect-error
  await cdp.send('HeadlessService.startRecording', {});

  await sleep(15000);

  // @ts-expect-error
  await cdp.send('HeadlessService.stopRecording', {});

  await browser.close();
}

main().catch(console.error);
