import puppeteer from 'puppeteer-core';

const TOKEN = '<token>';

const browserWSURL = new URL('ws://127.0.0.1:3000');
browserWSURL.searchParams.set('token', TOKEN);
browserWSURL.searchParams.set('stealth', 'advanced');
browserWSURL.searchParams.set('launch[headless]', 'false');
const browserWSEndpoint = browserWSURL.href;

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://bot.sannysoft.com', {
    waitUntil: 'domcontentloaded',
  });

  const title = await page.title();
  console.log(title);

  // await browser.close();
}

main().catch(console.error);
