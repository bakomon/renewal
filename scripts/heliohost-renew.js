require('dotenv').config();
const puppeteer = require('rebrowser-puppeteer');

(async () => {
  console.time('⏱️ browser-runtime');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const [ page ] = await browser.pages();

  try {
    // 1. Go to dashboard page
    console.log('Navigating to dashboard page...');
    const dashboard = 'https://heliohost.org/dashboard/';
    await page.goto(dashboard, { waitUntil: 'load', timeout: 60000 });

    // 2. It will redirect to login page if not logged in, so perform login
    console.log('Waiting for login input...');
    await page.waitForSelector('#login_form input[name="email"]', { visible: true });
    await page.waitForSelector('#login_form input[name="password"]', { visible: true });

    console.log('Typing email & password...');
    await page.type('#login_form input[name="email"]', process.env.EMAIL);
    await page.type('#login_form input[name="password"]', process.env.HELIOHOST_PASSWORD);

    console.log('Submitting login form & waiting for navigation back to dashboard page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
      await page.click('#login_form input[type="submit"]')
    ]);

    // 3. Check if redirected back to dashboard
    if (page.url().startsWith(dashboard)) {
      console.log('Successfully redirected to dashboard page.');

      // 4. Check #custom-timer element which contains "Time until suspension" text
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

  console.log("Closing browser...");
  await browser.close();

  console.timeEnd('⏱️ browser-runtime');
})();
