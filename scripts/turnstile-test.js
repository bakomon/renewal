require('dotenv').config();
const puppeteer = require('rebrowser-puppeteer');
const { sleep } = require('../helpers/turnstile');
const { solveChallenge } = require('../helpers/cf-challenge');

(async () => {
  console.time('⏱️ browser-runtime');

  const PROXY = process.env.PROXY_URL;
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized'
  ];
  if (PROXY) launchArgs.push(`--proxy-server=${PROXY}`);

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: false,
    args: launchArgs,
    defaultViewport: null
  });

  const [ page ] = await browser.pages();
  if (PROXY && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
    await page.authenticate({
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD
    });
  }

  let verify = null;

  try {
    /**
     * - https://github.com/ZFC-Digital/puppeteer-real-browser/blob/510939f606df79e70688cc112e74b93eb1420a2d/test/cjs/test.js#L50
     * - https://github.com/hehehai/headless-try/blob/66cfd6294ac93bb1e1d563955582e0af62add48e/src/utils/cfCheck.js
     */

    const testUrl = 'https://nopecha.com/demo/cloudflare';
    // const testUrl = 'https://2captcha.com/demo/cloudflare-turnstile-challenge';
    // const testUrl = 'https://www.scrapingcourse.com/cloudflare-challenge';
    // const testUrl = 'https://sergiodemo.com/security/challenge/legacy-challenge';

    console.log(`Navigating to test page "${testUrl}" ...`);
    const response = await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // If a Cloudflare challenge appears while verifying, solve it
    const attempt = 3;
    const { detected: isChallenge } = await solveChallenge(page, response, attempt);
    if (isChallenge) console.log(`Cloudflare challenge still detected during verify after ${attempt} attempts`);

    console.log('Verifying result...');
    let startDate = Date.now();
    while (!verify && (Date.now() - startDate) < 5000) {
      verify = await page.evaluate(() => { return document.querySelector('.demo_group') ? true : null }).catch(() => null);
      await sleep(1000);
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log('Closing browser...');
  await browser.close();

  const verified = verify === true;
  console.log(`Cloudflare WAF test passed: ${verified ? '✔️' : '❌'} ${verified}`);

  console.timeEnd('⏱️ browser-runtime');
})();
