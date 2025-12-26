const { execSync } = require('child_process');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const fs = require('fs');

dayjs.extend(utc);

const config = [
  // https://day.js.org/docs/en/display/difference#list-of-all-available-units
  { workflow: "keepalive.yml", interval: { value: 55, unit: "day" } },
  { workflow: "alwaysdata-renew.yml", interval: { value: 85, unit: "day" } },
  { workflow: "heliohost-renew.yml", interval: { value: 25, unit: "day" } },
  { workflow: "webhostmost-renew.yml", interval: { value: 40, unit: "day" } },
  { workflow: "zampto-renew.yml", interval: { value: 26, unit: "hour" } }
  // netsons.com - every year, expiration: 03/08/2026
];

const GH_REPO = process.env.GH_REPO;
let GIST_ID = process.env.GIST_ID;

// Helper: run gh CLI
function gh(cmd) {
  return execSync(`gh ${cmd}`, { stdio: "pipe" }).toString().trim();
}

// Ensure gist exists
function ensureGist() {
  if (GIST_ID) {
    console.log(`Found GIST_ID=${GIST_ID}, checking gist...`);
    try {
      gh(`gist view ${GIST_ID} --raw`);
      console.log('Existing gist is accessible.');
      return GIST_ID;
    } catch (err) {
      console.log('⚠️ Gist not found or inaccessible, will create new one.');
      console.error('❌', err?.message);
    }
  } else {
    console.log('⚠️ No GIST_ID env present, will create new gist.');
  }

  fs.writeFileSync('timestamp.json', '{}');
  const output = gh(`gist create timestamp.json --desc "⏱️ Scheduler timestamps: https://github.com/${GH_REPO}"`);
  const newId = output.split('/').pop(); // gist URL → extract ID
  console.log(`✔️ Gist created: ${newId}`);

  try {
    gh(`secret set GIST_ID -b"${newId}"`);
    console.log('🔑 Stored new GIST_ID in repo secrets.');
  } catch (err) {
    console.log('⚠️ Failed to store GIST_ID in secrets:');
    console.error('❌', err?.message);
    process.exit(1);
  }
  return newId;
}

// Load timestamps
function loadTimestamps(id) {
  try {
    const raw = gh(`gist view ${id} --filename timestamp.json --raw`);
    console.log('Timestamps fetched from gist.');
    return JSON.parse(raw || "{}");
  } catch (err) {
    console.log('⚠️ No "timestamp.json" found or failed to parse, initializing empty timestamps.');
    console.error('❌', err?.message);
    return {};
  }
}

// Save timestamps
function saveTimestamps(id, data) {
  fs.writeFileSync('timestamp.json', JSON.stringify(data));
  gh(`gist edit ${id} --add timestamp.json`);
  console.log('💾 Timestamps updated in gist.');
}

(async () => {
  console.log('Scheduler script started.');
  try {
    GIST_ID = ensureGist();
    const timestamps = loadTimestamps(GIST_ID);
    const now = dayjs.utc();
    console.log(`Current time (UTC): ${now.format()}`);

    let timestampsChanged = false;

    for (const { workflow, interval } of config) {
      console.log(`---`);
      console.log(`Checking workflow: ${workflow}`);
      const lastRun = timestamps[workflow] || null;
      const grace = Math.ceil(interval.value * 0.01); // grace period buffer (round up 1% of interval)
      const shouldRun = !lastRun || now.diff(lastRun, interval.unit) >= (interval.value - grace);

      if (shouldRun) {
        console.log(`🚀 Triggering workflow: ${workflow}`);
        execSync(`gh workflow run ${workflow}`);
        timestamps[workflow] = now.format();
        timestampsChanged = true;
        console.log(`✅ Workflow "${workflow}" marked as run at ${timestamps[workflow]}`);
      } else {
        console.log(`⏭️ Skipping "${workflow}", last run at ${lastRun}`);
      }
    }
    console.log(`---`);

    if (timestampsChanged) {
      saveTimestamps(GIST_ID, timestamps);
    } else {
      console.log('No workflows triggered, timestamps unchanged. Gist not updated.');
    }
    console.log('Scheduler script finished successfully.');
  } catch (err) {
    console.error('❌', err?.message);
    process.exit(1);
  }
})();
