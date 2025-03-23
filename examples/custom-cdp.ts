import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint: 'ws://127.0.0.1:3000/?launch[headless]=false&live=true',
  });

  const page = await browser.newPage();

  const cdp = await page.createCDPSession();
  // @ts-ignore
  const result = await cdp.send('HeadlessService.liveURL', { baz: 'qux' });
  console.log('🚀 ~ main ~ result:', result);

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
  });

  await new Promise<void>((resolve) =>
    cdp.on('HeadlessService.liveComplete', (...args) => {
      console.log('🚀 ~ main ~ args:', args);

      return resolve();
    })
  );

  await browser.close();
}

main().catch(console.error);
