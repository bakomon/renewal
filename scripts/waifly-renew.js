require('dotenv').config();
const puppeteer = require('rebrowser-puppeteer');

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
    // 1. Go to dashboard page
    console.log('Navigating to dashboard page...');
    const dashUrl = 'https://dash.waifly.com/index.html';
    await page.goto(dashUrl, { waitUntil: 'load', timeout: 60000 });

    const identifier = '#loginForm form input[name="email"]';
    const password = '#loginForm form input[name="password"]';

    // 2. It will redirect to login page if not logged in, so perform login
    console.log('Waiting for login input...');
    await page.waitForSelector(identifier, { visible: true });
    await page.waitForSelector(password, { visible: true });

    console.log('Typing email & password...');
    await page.type(identifier, process.env.EMAIL);
    await page.type(password, process.env.WAIFLY_PASSWORD);

    // Accept cookies if the button is present before submitting the login form
    console.log('Checking for cookie accept button...');
    try {
      const cookie = 'button#cookie-accept';
      await page.waitForSelector(cookie, { visible: true, timeout: 3000 });
      await page.click(cookie);
      console.log('✔️ Cookies accepted.');
    } catch (err) {
      console.log('⚠️ No cookie accept button found (skipping).');
    }

    console.log('Submitting login form & waiting for navigation back to dashboard page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
      page.click('#loginForm form button[type="submit"]')
    ]);

    // 3. Check if redirected back to dashboard page
    if (page.url().startsWith(dashUrl)) {
      console.log('Successfully redirected to dashboard page.');

      // 4. Check for logout button to confirm login
      console.log('Checking "logout" button to verify login status...');
      await page.waitForSelector('#user-submenu a[href*="logout"]');
      console.log('✔️ Login verified successfully.');
    } else {
      console.log('❌ Did not redirect to dashboard page. Current URL:', page.url());
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log("Closing browser...");
  await browser.close();

  console.timeEnd('⏱️ browser-runtime');
})();
