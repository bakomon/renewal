require('dotenv').config();
const puppeteer = require('rebrowser-puppeteer');
const { solve, sleep } = require('../helpers/turnstile');

async function checkCloudflareChallenge(page, response) {
  // Try headers first (fast)
  try {
    if (response && typeof response.headers === 'function') {
      const headers = response.headers();
      if (headers && headers['cf-mitigated'] === 'challenge') {
        return { detected: true, reason: 'header' };
      }
    }
  } catch (e) {
    // ignore
  }

  // Check window._cf_chl_opt
  try {
    const hasCfOpt = await page.evaluate(() => !!window._cf_chl_opt).catch(() => false);
    if (hasCfOpt) return { detected: true, reason: 'window._cf_chl_opt' };
  } catch (e) {
    // ignore
  }

  return { detected: false };
}

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
    // const testUrl = 'https://www.scrapingcourse.com/cloudflare-challenge';
    // const testUrl = 'https://sergiodemo.com/security/challenge/legacy-challenge';

    console.log(`Navigating to test page "${testUrl}" ...`);
    let response = await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // If a Cloudflare challenge appears while verifying, re-solve it
    let isChallenge = await checkCloudflareChallenge(page, response).catch(() => ({ detected: false }));
    if (isChallenge.detected) {
      const maxAttempts = 3;
      let attempt = 0;
      while (attempt <= maxAttempts && isChallenge.detected) {
        if (attempt > 0) {
          console.log(`⚠️ Challenge page detected during verify (${isChallenge.reason}), re-solving (attempt ${attempt}/${maxAttempts})...`);
          await sleep(5000);
        }

        [ response ] = await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
          solve(page, { challenge_page: true })
        ]);

        isChallenge = await checkCloudflareChallenge(page, response).catch(() => ({ detected: false }));
        attempt++;
      }

      if (isChallenge.detected) {
        try {
          await page.waitForSelector('#challenge-success-text', { visible: true, timeout: 10000 });
        } catch (e) {
          console.log(`❌ Reached max solve attempts (${maxAttempts}), but challenge still detected.`);
        }
      }
    }

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
