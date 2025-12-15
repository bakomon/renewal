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
    // 1. Go to client area page
    console.log('Navigating to client area page...');
    const clientArea = 'https://client.webhostmost.com/clientarea.php';
    await page.goto(clientArea, { waitUntil: 'load', timeout: 60000 });

    // 2. It will redirect to login page if not logged in, so perform login
    console.log('Waiting for login input...');
    await page.waitForSelector('input#inputEmail', { visible: true });
    await page.waitForSelector('input#inputPassword', { visible: true });

    console.log('Typing email & password...');
    await page.type('input#inputEmail', process.env.EMAIL);
    await page.type('input#inputPassword', process.env.WEBHOSTMOST_PASSWORD);

    console.log('Submitting login form...');
    await page.click('button[type="submit"]');

    // 3. Wait for redirect back to client area page
    console.log('Waiting for navigation back to client area page...');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    if (page.url().startsWith(clientArea)) {
      console.log('Successfully redirected to client area page.');

      // 4. Check #custom-timer element which contains "Time until suspension" text
      console.log('Checking #custom-timer if it contains suspension text...');
      await page.waitForSelector('#custom-timer', { visible: true });
      const timerText = await page.$eval('#custom-timer', el => el.innerText || el.textContent);
      if (!timerText.includes('Time until suspension')) {
        throw new Error('#custom-timer does not contain expected text "Time until suspension".');
      }
      console.log('✔️ Login succeeded.', timerText);
    } else {
      console.log('❌ Did not redirect to client area page. Current URL:', page.url());
    }
  } catch (err) {
    console.error('❌', err);
    process.exitCode = 1; // mark CI job as failed
  }

  console.log("Closing browser...");
  await browser.close();

  console.timeEnd('⏱️ browser-runtime');
})();
