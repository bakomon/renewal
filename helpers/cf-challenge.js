const { solve, sleep } = require('./turnstile');

async function checkChallenge(page, response) {
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

async function solveChallenge(page, response, maxAttempts = 3) {
  // initial check
  let isChallenge = await checkChallenge(page, response).catch(() => ({ detected: false }));
  if (!isChallenge.detected) return { response, detected: false, reason: isChallenge.reason };

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
    
    await sleep(5000);
    isChallenge = await checkChallenge(page, response).catch(() => ({ detected: false }));
    attempt++;
  }

  if (isChallenge.detected) {
    try {
      await page.waitForSelector('#challenge-success-text', { visible: true, timeout: 10000 });
    } catch (e) {
      console.log(`❌ Reached max solve attempts (${maxAttempts}), but challenge still detected.`);
    }
  }

  return { response, detected: isChallenge.detected, reason: isChallenge.reason };
}

module.exports = {
  checkChallenge,
  solveChallenge
};