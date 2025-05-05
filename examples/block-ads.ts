import puppeteer from 'puppeteer-core';

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint: 'ws://127.0.0.1:3000/?block_ads=true',
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('https://adblock-tester.com/', {
    waitUntil: 'domcontentloaded',
  });

  const title = await page.title();
  console.log(title);

  const finalScoreValueEl = await page.waitForSelector('.final-score-value');

  if (!finalScoreValueEl) {
    console.error('Final score value element not found. This means AdBlock is not working.');

    await browser.close();

    return;
  }

  const finalScoreValue = await finalScoreValueEl.evaluate((el) => el.textContent);

  console.log('Final score value: %s points out of 100', finalScoreValue);

  await browser.close();
}

main().catch(console.error);
