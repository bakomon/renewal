require('dotenv').config();
const puppeteer = require('rebrowser-puppeteer');

(async () => {
  const isDev = process.env.NODE_ENV !== 'production';
  console.time('⏱️ browser-runtime');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: isDev ? process.env.CHROME_PATH : undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const [ page ] = await browser.pages();

  try {
    // 1. Go to renewal page
    console.log('Navigating to renewal page...');
    const serverId = process.env.ZAMPTO_SERVER;
    const renewUrl = `https://dash.zampto.net/server?id=${serverId}&renew=true`;
    await page.goto(renewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 2. It will redirect to login page if not logged in, so perform login
    console.log('Waiting for login identifier input...');
    await page.waitForSelector('input[name="identifier"]', { visible: true });
    console.log('Typing email...');
    await page.type('input[name="identifier"]', process.env.EMAIL);
    console.log('Submitting email...');
    await page.click('button[type="submit"]');

    console.log('Waiting for password input...');
    await page.waitForSelector('input[name="password"]', { visible: true });
    console.log('Typing password...');
    await page.type('input[name="password"]', process.env.ZAMPTO_PASSWORD);
    console.log('Submitting password...');
    await page.click('button[type="submit"]');

    // 3. Wait for redirect back to renewal page
    console.log('Waiting for navigation back to renewal page...');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    if (page.url().startsWith(renewUrl)) {
      console.log('Successfully redirected to renewal page.');

      // 4. Print JSON response
      console.log('Fetching renewal response...');
      const body = await page.evaluate(() => document.body.innerText);
      console.log('Renewal response:', body);

      let res;
      try {
        res = JSON.parse(body);
      } catch (e) {
        throw new Error('Failed to parse renewal response as JSON.');
      }

      // res.success = false; // For testing failure handling
      if (!res.success) {
        throw new Error('Renewal failed: success is not true in response.');
      }
      console.log('✔️ Renewal succeeded. Next renewal:', res.nextRenewal);
    } else {
      console.log('❌ Did not redirect to renewal page. Current URL:', page.url());
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log("Closing browser...");
  await browser.close();

  console.timeEnd('⏱️ browser-runtime');
})();
