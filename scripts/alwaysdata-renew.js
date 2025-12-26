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
    // 1. Go to administration page
    console.log('Navigating to administration page...');
    const clientArea = 'https://admin.alwaysdata.com/site/';
    await page.goto(clientArea, { waitUntil: 'load', timeout: 60000 });

    // 2. It will redirect to login page if not logged in, so perform login
    console.log('Waiting for login input...');
    await page.waitForSelector('input#id_login', { visible: true });
    await page.waitForSelector('input#id_password', { visible: true });

    console.log('Typing email & password...');
    await page.type('input#id_login', process.env.EMAIL);
    await page.type('input#id_password', process.env.ALWAYSDATA_PASSWORD);

    console.log('Submitting login form & waiting for navigation back to administration page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
      await page.click('button[type="submit"]')
    ]);
    
    // 3. Check if redirected back to dashboard
    if (page.url().startsWith(clientArea)) {
      console.log('Successfully redirected to administration page.');

      // 4. Check #custom-timer element which contains "Time until suspension" text
      console.log('Checking "logout" button to verify login status...');
      await page.waitForSelector('.user-menu a[href*="/logout/"]');
      console.log('✔️ Login verified successfully.');
    } else {
      console.log('❌ Did not redirect to administration page. Current URL:', page.url());
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log("Closing browser...");
  await browser.close();

  console.timeEnd('⏱️ browser-runtime');
})();
