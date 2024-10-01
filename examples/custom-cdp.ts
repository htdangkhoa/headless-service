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

  await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  const page2 = await browser.newPage();

  const cdp2 = await page2.createCDPSession();
  // @ts-ignore
  const result2 = await cdp2.send('HeadlessService.liveURL', { baz: 'qux' });
  console.log('🚀 ~ main ~ result2:', result2);

  await new Promise<void>((resolve) =>
    cdp2.on('HeadlessService.liveComplete', (...args) => {
      console.log('🚀 ~ main ~ args:', args);

      return resolve();
    })
  );

  await page2.setViewport({ width: 1920, height: 1080 });
  await page2.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
  });

  const title = await page2.title();
  console.log(title);

  await browser.close();
}

main().catch(console.error);
