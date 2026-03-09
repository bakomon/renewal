require('dotenv').config();
const puppeteer = require('rebrowser-puppeteer');

(async () => {
  console.time('⏱️ browser-runtime');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null
  });

  const [ page ] = await browser.pages();

  try {
    // 1. Go to control panel page
    console.log('Navigating to control panel page...');
    const clientArea = 'https://cp.sprinthost.ru/main/index';
    await page.goto(clientArea, { waitUntil: 'load', timeout: 60000 });

    const identifier = '.form-sign-in--login input.ym-record-keys';
    const password = '.form-sign-in--password input[type="password"]';

    // 2. It will redirect to login page if not logged in, so perform login
    console.log('Waiting for login input...');
    await page.waitForSelector(identifier, { visible: true });
    console.log('Typing email...');
    await page.type(identifier, process.env.EMAIL);
    console.log('Submitting email...');
    await page.click('.form-sign-in--login button[type="submit"]');

    console.log('Waiting for password input...');
    await page.waitForSelector(password, { visible: true });
    console.log('Typing password...');
    await page.type(password, process.env.SPRINTHOST_PASSWORD);

    console.log('Submitting login form & waiting for navigation back to control panel page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => null),
      page.click('.form-sign-in--password button[type="submit"]')
    ]);

    // 3. Check if redirected back to control panel page
    if (page.url().startsWith(clientArea)) {
      console.log('Successfully redirected to control panel page.');

      // 4. Check "upgrade" button which indicates logged-in status
      console.log('Checking "upgrade" button to verify login status...');
      await page.waitForSelector('a[href*="/customer/package/change"]');
      console.log('✔️ Login verified successfully.');
    } else {
      console.log('❌ Did not redirect to control panel page. Current URL:', page.url());
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log('Closing browser...');
  await browser.close();

  console.timeEnd('⏱️ browser-runtime');
})();
