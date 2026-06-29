#!/usr/bin/env node
/**
 * screenshot.js — capture the current page (or a specific URL) in QA Chrome
 *
 * Usage:
 *   node sys/screenshot.js [--url <URL>] [--out <path>] [--full] [--port <port>]
 *
 * Args:
 *   --url    Navigate to this URL before screenshotting. Omit to capture whatever is open.
 *   --out    Output path. Default: /tmp/qa_screenshot.png
 *   --full   Capture full page height (not just the viewport). Default: viewport only.
 *   --port   Chrome CDP port. Default: 9222
 *
 * Output: prints the saved file path to stdout
 * Exit 1 on error (Chrome not running, navigation failed)
 */

const { chromium } = require(
  process.env.PW ||
  (() => {
    const { execSync } = require('child_process');
    // Try npx cache first, then nvm-based @playwright/mcp install
    try {
      return execSync('ls -td ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
    } catch (_) {}
    try {
      return execSync('ls ~/.nvm/versions/node/*/lib/node_modules/@playwright/mcp/node_modules/playwright/index.js 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
    } catch (_) {}
    throw new Error('Playwright not found. Run: npx playwright install chromium');
  })()
);

const args = process.argv.slice(2);
const get = (flag, def) => { const i = args.indexOf(flag); return i !== -1 && args[i + 1] ? args[i + 1] : def; };
const has = (flag) => args.includes(flag);

const url    = get('--url', null);
const out    = get('--out', '/tmp/qa_screenshot.png');
const full   = has('--full');
const port   = get('--port', '9222');

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  } catch (e) {
    console.error(`ERROR: Cannot connect to Chrome on port ${port}. Run sys/chrome-launch.sh first.`);
    process.exit(1);
  }

  const context = browser.contexts()[0];
  let page;

  if (url) {
    // Reuse existing tab if URL already open (base URL match, ignoring query params)
    const base = url.split('?')[0].replace(/\/$/, '');
    page = context.pages().find(p => p.url().split('?')[0].replace(/\/$/, '') === base);
    if (!page) {
      page = await context.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(3000);
    }
  } else {
    // No URL — capture whatever is currently in the foreground tab
    page = context.pages().find(p => p.url() !== 'about:blank') || context.pages()[0];
  }

  if (!page) {
    console.error('ERROR: No open page found in QA Chrome.');
    await browser.close();
    process.exit(1);
  }

  await page.bringToFront();

  await page.screenshot({ path: out, fullPage: full });

  console.log(out);
  await browser.close();
})();
