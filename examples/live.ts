import puppeteer from 'puppeteer-core';

const TOKEN = '<token>';

const browserWSURL = new URL('ws://127.0.0.1:3000');
browserWSURL.searchParams.set('token', TOKEN);
browserWSURL.searchParams.set('unblock', 'true');
const browserWSEndpoint = browserWSURL.href;

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint,
  });

  const page = await browser.newPage();

  const cdp = await page.createCDPSession();

  // @ts-ignore
  const { liveURL } = await cdp.send('HeadlessService.liveURL');
  console.log('🚀 ~ main ~ liveURL:', liveURL);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(
    'https://accounts.google.com/v3/signin/identifier?passive=true&flowName=GlifWebSignIn&flowEntry=ServiceLogin',
    {
      waitUntil: 'domcontentloaded',
    }
  );

  const title = await page.title();
  console.log(title);

  await new Promise<void>((resolve) =>
    cdp.on('HeadlessService.liveComplete', () => {
      return resolve();
    })
  );

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
