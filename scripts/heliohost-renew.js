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
    // 1. Go to dashboard page
    console.log('Navigating to dashboard page...');
    const dashUrl = 'https://heliohost.org/dashboard/';
    await page.goto(dashUrl, { waitUntil: 'load', timeout: 60000 });

    const identifier = '#login_form input[name="email"]';
    const password = '#login_form input[name="password"]';

    // 2. It will redirect to login page if not logged in, so perform login
    console.log('Waiting for login input...');
    await page.waitForSelector(identifier, { visible: true });
    await page.waitForSelector(password, { visible: true });

    console.log('Typing email & password...');
    await page.type(identifier, process.env.EMAIL);
    await page.type(password, process.env.HELIOHOST_PASSWORD);

    console.log('Submitting login form & waiting for navigation back to dashboard page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
      page.click('#login_form input[type="submit"]')
    ]);

    // 3. Check if redirected back to dashboard page
    if (page.url().startsWith(dashUrl)) {
      console.log('Successfully redirected to dashboard page.');

      // 4. Check for logout button to confirm login
      console.log('Checking "logout" button to verify login status...');
      await page.waitForSelector('#login-content button[onclick*="/logout/"]');
      console.log('✔️ Login verified successfully.');
    } else {
      console.log('❌ Did not redirect to dashboard page. Current URL:', page.url());
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log('Closing browser...');
  await browser.close();

  console.timeEnd('⏱️ browser-runtime');
})();
