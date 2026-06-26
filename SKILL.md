---
name: live-browser-qa
description: Use when asked to test, verify, or QA any web app UI in a real visible Chrome the user can watch — login flows, form submissions, button clicks, page navigation, visual state checks, Google OAuth. Use when the user says "test this", "check if this works", "verify the flow", "run through the UI", or "show me it working".
---

# live-browser-qa: Live Browser QA in a Real Chrome

> **Keep this skill current** — edge cases and Chrome version quirks get fixed as they're found:
> ```bash
> git -C ~/.claude/skills/live-browser-qa pull
> ```

Drive a real, visible Chrome the user watches. Attach Playwright over CDP, interact by element meaning (role, label, text) — no pixel coordinates, no test scripts to maintain. You say what to test, the skill figures out the rest from the live page.

> **Platform note:** Setup commands use macOS (`open -na "Google Chrome"`). On Linux, replace with `google-chrome` or `chromium`. The Playwright/Node steps work on both.

## The one thing that makes this work: a dedicated QA Chrome

Chrome 136+ **blocks `--remote-debugging-port` for any profile inside the default Chrome directory** (`~/Library/Application Support/Google/Chrome/`). Error: `DevTools remote debugging requires a non-default data directory`. So you CANNOT CDP-attach to the user's normal Chrome or any profile in it.

The fix: a **persistent custom `--user-data-dir` outside** the default folder. Log into Google there **once**; it persists forever. CDP works because the dir is non-default. This runs ALONGSIDE the user's normal Chrome — separate instance, separate window, doesn't touch their browsing.

`~/chrome-qa-profile` is the standing QA dir. Reuse it every run.

## Setup (idempotent — run every time, it's a no-op if already up)

```bash
# Is the QA Chrome already up with CDP?
if curl -s http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
  echo "QA Chrome already running"
else
  # macOS:
  open -na "Google Chrome" --args \
    --remote-debugging-port=9222 \
    --user-data-dir="$HOME/chrome-qa-profile" \
    --no-first-run --no-default-browser-check \
    "http://localhost:3000"
  # Linux: google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-qa-profile" &
  sleep 6
  curl -s http://127.0.0.1:9222/json/version | python3 -m json.tool | grep Browser
fi
```

**First-ever run:** the QA dir has no Google session. If the test needs Gmail / "Continue with Google", tell the user: "Log into Google in the QA Chrome window once — it'll persist for all future runs." Email/password tests need no login.

### Hard rule: never kill or relaunch Chrome while a script is running

The #1 cause of `Target page... has been closed` is churning Chrome mid-run. Launch it ONCE in setup, leave it alone, then attach. If CDP is in a bad state, fully `pkill -f chrome-qa-profile`, wait 2s, relaunch, THEN run the automation as a separate step.

## Driving it (Playwright — primary)

Playwright `connectOverCDP` works against this Chrome. Resolve the npx-cached playwright (no local install needed):

```bash
PW=$(ls -td ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -1)
# if empty: npx playwright install chromium  (downloads the driver once)
```

```javascript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW);   // path from $PW above

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find(p => p.url().includes('localhost:3000'))
          || browser.contexts()[0].pages()[0];
await page.bringToFront();

// Interact by meaning — survives HTML/CSS changes
await page.goto('http://localhost:3000/login');
await page.getByLabel('Email').fill('test@example.com');
await page.getByLabel('Password').fill('password123');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/dashboard**', { timeout: 12000 });

const banner = await page.getByText('welcome').isVisible().catch(() => false);
console.log('Banner:', banner);

await page.screenshot({ path: '/tmp/qa_step.png' });   // then Read it to show the user
await browser.close();   // close() detaches; it does NOT quit the user's Chrome
```

Run it: `node --input-type=module <<'SCRIPT' ... SCRIPT` with `PW=$PW` exported, from the frontend dir.

### Element selectors — by meaning, not position

```javascript
page.getByRole('button', { name: 'Update password' })
page.getByLabel('New password')
page.getByText('Password updated')
page.getByRole('link', { name: 'Settings' })
await locator.waitFor({ timeout: 5000 })   // always wait before asserting
```

## Fallback: puppeteer-core

If a Playwright version ever throws `Browser.setDownloadBehavior: Browser context management is not supported`, use puppeteer-core via the browser WebSocket:

```bash
cd /tmp && npm install puppeteer-core   # once
```
```javascript
const puppeteer = require('/tmp/node_modules/puppeteer-core');
const v = await fetch('http://127.0.0.1:9222/json/version').then(r => r.json());
const browser = await puppeteer.connect({ browserWSEndpoint: v.webSocketDebuggerUrl, defaultViewport: null });
const t = browser.targets().find(t => t.type()==='page' && t.url().includes('localhost:3000'));
const page = await t.page();
await page.type('input[type="email"]', 'test@example.com', { delay: 80 });
// ... page.click, page.$$, page.waitForNavigation({waitUntil:'networkidle0'}) ...
browser.disconnect();
```

## Standard QA loop

1. Setup (launch QA Chrome if down) — separate step, before any automation
2. Attach, navigate, act (fill / click / submit) — by role/label/text
3. `waitFor` / `waitForURL` after every action — never assume it landed
4. Screenshot after each meaningful step → Read the PNG to show the user
5. Report pass/fail per step with the screenshot as evidence

## Verifying scroll-linked animations (scroll-scrub, pinned reveals)

To check a scroll-driven effect (word-by-word reveals, pinned scenes, parallax,
scale-on-scroll) you must scroll like a human — **real wheel events**, not instant jumps:

```javascript
await page.mouse.move(720, 450);
for (let i = 0; i < 24; i++) { await page.mouse.wheel({ deltaY: 45 }); await pause(60); }
await pause(1500); // let smooth-scroll + animation settle
```

- **Instant `lenis.scrollTo(y, {immediate:true})` / `window.scrollTo` lie.** Scroll-linked
  libraries (Framer Motion `useScroll`, GSAP ScrollTrigger) don't update reliably on an
  instant jump, so opacity/transform sampled right after reads stale/garbage and looks
  "broken" when it isn't. Drive it with `page.mouse.wheel` to get the true state.
- **Measure, don't eyeball.** Sample the real values during the scroll and assert they move
  monotonically: `getComputedStyle(el).opacity` / `.transform` across steps. A reveal that
  goes lit→dim→lit as you scroll down is a real bug (often a Framer-`useScroll`-vs-Lenis
  desync).
- Screenshot at a few depths (enter / mid / full) and Read them — the rendered frame is
  ground truth even when numeric sampling is noisy.

## Common mistakes (all learned the hard way)

- **Using `--profile-directory="Profile N"`** → Chrome blocks CDP on default-dir profiles. Use `--user-data-dir` outside the default folder. No exceptions.
- **Killing/relaunching Chrome mid-script** → page closes, `Target closed`. Launch once in setup, never during automation.
- **Expecting the user's normal Chrome to be CDP-attachable** → it isn't (launched without the port, and it's a default-dir profile). The QA Chrome is a separate dedicated instance.
- **`browser.close()` fear** → it only detaches the CDP client; the visible Chrome stays open. Safe.
- **Screenshot before load** → `await page.waitForLoadState('networkidle')` (Playwright) or `waitUntil:'networkidle0'` (puppeteer) first.
- **Reading the wrong tab** → filter pages by `url().includes(...)`, verify `page.url()` before acting.
