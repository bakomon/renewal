require('dotenv').config();
const puppeteer = require('rebrowser-puppeteer');
const { solve } = require('../helpers/turnstile');

(async () => {
  console.time('⏱️ browser-runtime');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    defaultViewport: null
  });

  const [ page ] = await browser.pages();
  let verified = null;

  try {
    /**
     * - https://github.com/ZFC-Digital/puppeteer-real-browser/blob/510939f606df79e70688cc112e74b93eb1420a2d/test/cjs/test.js#L50
     * - https://github.com/hehehai/headless-try/blob/66cfd6294ac93bb1e1d563955582e0af62add48e/src/utils/cfCheck.js
     */

    console.log('Navigating to test page...');
    await page.goto("https://nopecha.com/demo/cloudflare");

    console.log('Solving turnstile captcha...');
    await solve(page);

    console.log('Verifying result...');
    let startDate = Date.now();
    while (!verified && (Date.now() - startDate) < 30000) {
        verified = await page.evaluate(() => { return document.querySelector('.demo_group') ? true : null }).catch(() => null);
        await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log('Closing browser...');
  await browser.close();

  console.log(`Cloudflare WAF test passed: ${verified ? '✔️' : '❌'} ${verified}`);

  console.timeEnd('⏱️ browser-runtime');
})();
