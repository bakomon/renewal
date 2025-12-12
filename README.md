# renewal

Automates free hosting renewal across providers using Puppeteer (via [rebrowser-puppeteer](https://www.npmjs.com/package/rebrowser-puppeteer)).

The repo includes an example script for **Zampto**, you can add additional provider scripts that follow the same pattern.


## Requirements

- Node.js (tested with Node 24)
- Chrome/Chromium installed locally if running on your machine (or use the Chromium downloaded by Puppeteer)
- Environment variables required by each provider script, for example:
  - Optional: `CHROME_PATH` — path to Chrome executable when running locally
  - `EMAIL`
  - `ZAMPTO_PASSWORD` (provider-specific name)
  - `ZAMPTO_SERVER` (provider-specific server/id)

When adding a new provider, document the environment variables that its script requires (e.g., `PROVIDER_EMAIL`, `PROVIDER_PASSWORD`, `PROVIDER_SERVER`, etc.).


## Install

If running locally and you already have Chrome/Chromium installed, skip downloading Chromium during install:

- macOS / Linux:
  ```sh
  PUPPETEER_SKIP_DOWNLOAD=true npm install
  ```

- Windows (PowerShell):
  ```sh
  $env:PUPPETEER_SKIP_DOWNLOAD="true"; npm install
  ```

- Windows (cmd.exe):
  ```sh
  set PUPPETEER_SKIP_DOWNLOAD=true && npm install
  ```

Otherwise run:
```sh
npm install
```

> [!IMPORTANT]  
> When using **rebrowser-puppeteer**, you need to manually install the browser binary. 
>
> To install Chrome via rebrowser-puppeteer run:
> ```sh
> npx rebrowser-puppeteer browsers install chrome
> ```
> See issue: [rebrowser/rebrowser-patches#44](https://github.com/rebrowser/rebrowser-patches/issues/44)


## Run

- Run the bundled Zampto script:
  ```sh
  npm run zampto
  ```

- Add additional scripts in [package.json](./package.json) for other providers, for example:
  ```json
  "provider1": "node provider1-renew.js"
  ```


## Implementation notes

- Scripts use **rebrowser-puppeteer/puppeteer** to control Chrome headlessly.
- Use `CHROME_PATH` in development to point at a local Chrome binary when skipping Puppeteer's Chromium download.
- Keep credentials and provider secrets out of source control; use environment variables or CI secrets.


## GitHub Actions

A sample workflow is included at [.github/workflows/zampto-renew.yml](./.github/workflows/zampto-renew.yml) to run a script on a schedule.

For CI runs, set repository secrets for the environment variables required by your script (for example: `EMAIL`, `ZAMPTO_PASSWORD`, `ZAMPTO_SERVER`).

If you add more provider scripts, create or update workflows and add the required secrets and schedule entries.
