const fs = require('fs');
const later = require('@breejs/later');
const { execSync } = require('child_process');

const config = JSON.parse(fs.readFileSync('scheduler.json', 'utf8'));
const now = new Date();

// baseline window = 6 hours
const windowMs = 6 * 3600 * 1000;

for (const { workflow, rule } of config) {
  try {
    const sched = later.parse.text(rule);
    const next = later.schedule(sched).next(1);

    // Check if "now" is within ±6 hours of the next occurrence
    const shouldRun = Math.abs(now - next) < windowMs;

    if (shouldRun) {
      console.log(`Triggering ${workflow}...`);
      execSync(`gh workflow run ${workflow}`, { stdio: 'inherit' });
    } else {
      console.log(`Skipping ${workflow}, not scheduled now.`);
    }
  } catch (err) {
    console.error(`❌ Error parsing rule for ${workflow}: ${rule}`, err);
    process.exit(1);
  }
}
