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

> **Platform note:** Setup commands use macOS. On Linux, replace the binary path with `google-chrome` or `chromium`. The Playwright/Node steps work on both.

## Works with any agent — not just Claude Code

The code in this skill is plain Node.js and bash. Any AI agent that can run shell commands can follow it.

- **Claude Code** — drop `SKILL.md` into `~/.claude/skills/live-browser-qa/` and it auto-triggers
- **Codex CLI** — paste the relevant setup + automation blocks into your `AGENTS.md`, or tell Codex to follow the steps in this file
- **Cursor / Windsurf / any IDE agent** — same: reference this file in your agent rules or paste the blocks directly into context
- **Any other agent** — the setup bash block and the Node.js automation block are self-contained; any agent that can run them can drive the browser

## The one thing that makes this work: a dedicated QA Chrome

Chrome 136+ **blocks `--remote-debugging-port` for any profile inside the default Chrome directory** (`~/Library/Application Support/Google/Chrome/`). Error: `DevTools remote debugging requires a non-default data directory`. So you CANNOT CDP-attach to the user's normal Chrome or any profile in it.

The fix: a **persistent custom `--user-data-dir` outside** the default folder. Log into Google there **once**; it persists forever. CDP works because the dir is non-default. This runs ALONGSIDE the user's normal Chrome — separate instance, separate window, doesn't touch their browsing.

`~/chrome-qa-profile` is the standing QA dir. Reuse it every run.

## Setup (idempotent — run every time, it's a no-op if already up)

```bash
if curl -s http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
  echo "QA Chrome already running on port 9222"
else
  # Launch QA Chrome via binary with a separate --user-data-dir.
  # Chrome's single-instance check is per user-data-dir, so this runs
  # alongside any existing regular Chrome window — no need to quit it first.
  # macOS:
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=9222 \
    --user-data-dir="$HOME/chrome-qa-profile" \
    --no-first-run --no-default-browser-check \
    "about:blank" &>/dev/null &
  # Linux: google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-qa-profile" &

  sleep 5
  curl -s http://127.0.0.1:9222/json/version | python3 -m json.tool | grep Browser \
    || echo "CDP not ready — wait a few more seconds and retry"

  # First-run login check: if the QA profile has never been used for OAuth,
  # the user must log in manually before automation continues.
  PROFILE_COOKIES="$HOME/chrome-qa-profile/Default/Cookies"
  if [ ! -f "$PROFILE_COOKIES" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "FIRST RUN — action required:"
    echo "The QA Chrome window just opened with a fresh profile."
    echo "If your test uses Google OAuth or any saved login:"
    echo "  → Go to the QA Chrome window"
    echo "  → Log into the account(s) your app uses for OAuth"
    echo "  → Come back here and confirm when done"
    echo "This only happens once. The session persists forever."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Press Enter when you've logged in (or if this test doesn't need OAuth)..."
    read -r
  fi
fi
```

### Hard rule: never kill or relaunch Chrome while a script is running

The #1 cause of `Target page... has been closed` is churning Chrome mid-run. Launch it ONCE in setup, leave it alone, then attach. If CDP is in a bad state, fully `pkill -f chrome-qa-profile`, wait 2s, relaunch, THEN run the automation as a separate step.

## Driving it (Playwright — primary)

Playwright `connectOverCDP` works against this Chrome. Resolve playwright (tries common locations, no local install needed):

```bash
PW=$(ls -td ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -1)
# nvm-based installs (e.g. @playwright/mcp):
[ -z "$PW" ] && PW=$(ls ~/.nvm/versions/node/*/lib/node_modules/@playwright/mcp/node_modules/playwright/index.js 2>/dev/null | head -1)
# if still empty: npx playwright install chromium  (downloads the driver once)
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
await page.locator('form').getByRole('button', { name: 'Sign in' }).click(); // scope to form — pages with a tab toggle also have a "Sign in" tab button
await page.waitForURL('**/dashboard**', { timeout: 12000 });

const banner = await page.getByText('welcome').isVisible().catch(() => false);
console.log('Banner:', banner);

await page.screenshot({ path: '/tmp/qa_step.png' });   // then Read it to show the user
await browser.close();   // close() detaches; it does NOT quit the user's Chrome
```

Run it: `node --input-type=module <<'SCRIPT' ... SCRIPT` with `PW=$PW` exported, from the frontend dir.

### Element selectors — by meaning, not position

```javascript
page.locator('form').getByRole('button', { name: 'Sign in' }) // scope when name is ambiguous (tab toggle + submit)
page.getByRole('button', { name: 'Update password' })
page.getByLabel('New password')
page.getByText('Password updated')
page.getByRole('link', { name: 'Settings' })
await locator.waitFor({ timeout: 5000 })   // always wait before asserting
```

**Strict mode gotcha:** Playwright throws if a locator matches more than one element. If a button name appears on both a tab toggle AND a submit button, scope it: `page.locator('form').getByRole('button', { name: '...' })`. Always verify with `.count()` if unsure.

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

## Fallback 2: Vision + raw CDP (the universal layer)

If Playwright and puppeteer-core both fail, this always works — no library version to
conflict, no npm cache to be empty, no Playwright install required. The agent looks at
the rendered page exactly like a human does, identifies what to click by sight, and
sends the input directly via CDP.

The tradeoff vs Playwright: if the visual layout changes significantly, coordinates need
to be re-identified. But the mechanism itself never breaks — as long as the page is
visible and the agent can read a screenshot, it can drive the browser.

**Only requires the `ws` package — one install, no Playwright, no puppeteer.**

```bash
cd /tmp && npm install ws 2>/dev/null
```

```javascript
// Step 1: take a screenshot via raw CDP
const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
const WebSocket = require('/tmp/node_modules/ws');
const fs = require('fs');

const v = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
const target = v.find(t => t.type === 'page' && t.url.includes('localhost'));
const ws = new WebSocket(target.webSocketDebuggerUrl);

let msgId = 1;
const send = (method, params = {}) => new Promise(resolve => {
  const id = msgId++;
  const handler = (data) => {
    const msg = JSON.parse(data);
    if (msg.id === id) { ws.off('message', handler); resolve(msg.result); }
  };
  ws.on('message', handler);
  ws.send(JSON.stringify({ id, method, params }));
});

await new Promise(r => ws.once('open', r));

// Navigate if needed
await send('Page.navigate', { url: 'http://localhost:3000/login' });
await new Promise(r => setTimeout(r, 2000));

// Screenshot → agent reads the PNG and identifies coordinates
const { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/tmp/qa_vision.png', Buffer.from(data, 'base64'));
// → Read /tmp/qa_vision.png now. Identify the x,y of the element to interact with.

// Step 2: type into a field at coordinates the agent identified from the image
const x = 640, y = 310;   // agent fills these in from the screenshot
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });

// Type text character by character
for (const char of 'test@example.com') {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: char });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', text: char });
}

// Step 3: screenshot again to verify the result
await new Promise(r => setTimeout(r, 1000));
const { data: data2 } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/tmp/qa_vision_after.png', Buffer.from(data2, 'base64'));
// → Read /tmp/qa_vision_after.png to confirm the action landed

ws.close();
```

**How the vision loop works:**
1. Screenshot the page → `Read /tmp/qa_vision.png`
2. Agent looks at the image, identifies pixel coordinates of the target element
3. Dispatch mouse/keyboard events at those coordinates via CDP
4. Screenshot again to verify → repeat until the flow completes

Use Playwright when you want semantic selectors that survive refactors.
Use this when you want something that always runs regardless of what's installed.

## Standard QA loop

1. Setup (launch QA Chrome if down) — separate step, before any automation
2. Try Playwright first → fall back to puppeteer-core → fall back to vision + raw CDP
3. Attach, navigate, act (fill / click / submit)
4. `waitFor` / `waitForURL` after every action — never assume it landed
5. Screenshot after each meaningful step → Read the PNG to show the user
6. Report pass/fail per step with the screenshot as evidence

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

- **Thinking you need to quit regular Chrome first** → you don't. Chrome's single-instance check is per `--user-data-dir`. Since QA Chrome uses `~/chrome-qa-profile` (outside the default dir), it launches as a separate instance alongside your normal Chrome. No quit needed.
- **Using `--profile-directory="Profile N"`** → Chrome blocks CDP on default-dir profiles. Use `--user-data-dir` outside the default folder. No exceptions.
- **Killing/relaunching Chrome mid-script** → page closes, `Target closed`. Launch once in setup, never during automation.
- **Expecting the user's normal Chrome to be CDP-attachable** → it isn't (launched without the port, and it's a default-dir profile). The QA Chrome is a separate dedicated instance.
- **`browser.close()` fear** → it only detaches the CDP client; the visible Chrome stays open. Safe.
- **Screenshot before load** → `await page.waitForLoadState('networkidle')` (Playwright) or `waitUntil:'networkidle0'` (puppeteer) first.
- **Reading the wrong tab** → filter pages by `url().includes(...)`, verify `page.url()` before acting.
