require('dotenv').config();
const puppeteer = require('rebrowser-puppeteer');
const { solve } = require('../helpers/turnstile');
const { solveChallenge } = require('../helpers/cf-challenge');

(async () => {
  console.time('⏱️ browser-runtime');

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized'
  ];

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: false,
    args: launchArgs,
    defaultViewport: null
  });

  const [ page ] = await browser.pages();

  try {
    // 1. Go to management page
    console.log('Navigating to management page...');
    const serverId = process.env.HIDENCLOUD_SERVER;
    const manageUrl = `https://dash.hidencloud.com/service/${serverId}/manage`;
    const response = await page.goto(manageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // If a Cloudflare challenge appears while verifying, solve it
    const attempt = 3;
    const { detected: isChallenge } = await solveChallenge(page, response, attempt);
    if (isChallenge) console.log(`Cloudflare challenge still detected during verify after ${attempt} attempts`);

    console.log('Solving turnstile captcha...');
    await solve(page);

    // 2. It will redirect to login page if not logged in, so perform login
    console.log('Waiting for login input...');
    await page.waitForSelector('input#username', { visible: true });
    await page.waitForSelector('input#password', { visible: true });

    console.log('Typing email & password...');
    await page.type('input#username', process.env.EMAIL);
    await page.type('input#password', process.env.HIDENCLOUD_PASSWORD);

    console.log('Submitting login form...');
    await page.click('button[type="submit"]');

    // 3. Wait for redirect back to management page
    console.log('Waiting for navigation back to management page...');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    if (page.url().startsWith(manageUrl)) {
      console.log('Successfully redirected to management page.');

      // 4. Submit renew form and follow payment flow

      // Ensure renew UI is visible by removing .hidden from parent #renewService-<serverId>
      const renewSelector = `#renewService-${serverId}`;
      await page.waitForSelector(renewSelector);
      await page.$eval(renewSelector, el => el.classList.remove('hidden'));

      console.log('Submitting renew form...');
      const renewFormSelector = `form[action$="/${serverId}/renew"]`;
      await page.waitForSelector(renewFormSelector, { visible: true });
      await page.$eval(renewFormSelector, f => f.submit()); // submit renew form

      // Wait for the invoice / payment redirect
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log('After renew submit, page redirect to:', page.url());

      // If redirected to an invoice page, submit the pay form
      if (page.url().includes('/payment/invoice/')) {
        console.log('On invoice page, submitting pay form...');
        const payFormSelector = 'form[action$="/pay"]';
        await page.waitForSelector(payFormSelector, { visible: true });
        await page.$eval(payFormSelector, f => f.submit());

        // Payment processing may redirect through a process URL before dashboard
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('After pay submit, page redirect to:', page.url());

        // Wait for payment success alert on dashboard
        const successAlertSelector = 'div[role="alert"]';
        await page.waitForSelector(successAlertSelector, { visible: true, timeout: 90000 });
        const alertText = await page.$eval(successAlertSelector, el => el.textContent?.trim() || '');
        console.log('Payment alert text:', alertText.trim().replace(/info\s+/i, ''));

        // Check for success message "Success! Your payment has been completed!"
        if (alertText.includes('payment has been completed') || page.url().includes('/dashboard')) {
          console.log('✔️ Renewal + payment succeeded.');
        } else {
          throw new Error('Payment did not show expected success message.');
        }
      } else {
        console.log('❌ Did not redirect to invoice/payment page. Current URL:', page.url());
      }
    } else {
      console.log('❌ Did not redirect to renewal page. Current URL:', page.url());
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log('Closing browser...');
  await browser.close();

  console.timeEnd('⏱️ browser-runtime');
})();
