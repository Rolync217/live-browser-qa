# live-browser-qa

A browser QA skill for AI coding agents — Claude Code, Codex CLI, Cursor, Windsurf, or any agent that can run bash and Node.js.

Tell your agent what to test. It drives a real, visible Chrome you can watch. No test scripts to write. No selectors to maintain.

---

## What agent is this for?

Any of them.

The skill is a set of instructions + working code that any coding agent can follow. The packaging differs by agent:

| Agent | How to use this skill |
|---|---|
| **Claude Code** | `git clone` into `~/.claude/skills/live-browser-qa/` — auto-triggers on "test this", "verify the flow", etc. |
| **Codex CLI** | Copy the relevant sections into your `AGENTS.md`, or tell Codex to follow the steps in `SKILL.md` |
| **Cursor / Windsurf** | Add the setup + automation blocks to your agent rules, or paste `SKILL.md` into context |
| **Any other agent** | The bash setup block and Node.js automation block are self-contained — any agent that can run them can drive the browser |

---

## What it does

- Detects whether your regular Chrome is open and prompts you to quit it — it will never auto-close Chrome or kill your tabs
- Launches a dedicated QA Chrome with a persistent profile at `~/chrome-qa-profile`
- On first run, pauses and prompts you to log into any accounts your app needs for OAuth — once done, the session persists forever
- Attaches Playwright over CDP and drives the browser by element meaning: `getByRole('button', { name: 'Sign in' })` — not brittle CSS selectors
- Screenshots after every step so you see exactly what happened
- Tests scroll animations correctly using real mouse wheel events (Framer Motion, GSAP ScrollTrigger, Lenis all lie on instant `window.scrollTo` jumps)
- Falls back to puppeteer-core if your Playwright version hits a known CDP context bug

---

## Full workflow (what actually happens)

**Step 1 — you tell your agent what to test**
> "Test the login flow" / "Verify the dashboard loads after sign-in" / "Check the signup form"

**Step 2 — agent runs the setup script**

The script checks port 9222 for an existing QA Chrome session. If none:

- It checks if regular Chrome is running
- If Chrome IS open: the script exits with a warning and the agent tells you: *"Chrome is currently open — please quit it (Cmd+Q) and let me know when you're ready."* Your tabs are safe. Nothing is auto-closed.
- Once Chrome is quit: the agent relaunches setup

**Step 3 — QA Chrome launches**

Launched via the Chrome binary directly (not `open -na`), so it reliably starts as a separate instance with CDP enabled on port 9222. It opens alongside wherever your app is running.

**Step 4 — first-run login (once, ever)**

If `~/chrome-qa-profile` has never been used, the agent pauses and tells you: *"This is the first run. If your app uses Google OAuth or any saved login, please log into those accounts in the QA Chrome window now. Come back when done."*

You log in manually in the visible QA Chrome window. From that point forward, every test run reuses that session — cookies, OAuth tokens, everything.

**Step 5 — automation runs**

The agent attaches Playwright over CDP, navigates to your app, and drives it by role and label — not by CSS class or position. It waits for each action to land before the next one, screenshots meaningful steps, and reports pass/fail with the screenshots as evidence.

**Step 6 — QA Chrome stays open**

`browser.close()` in Playwright only detaches the CDP client — it does not quit Chrome. The QA Chrome window stays open. Next test run skips setup entirely and reattaches.

---

## Why a persistent separate Chrome profile?

Two reasons this matters:

**Reason 1: Google OAuth**

A fresh Playwright browser (no profile, no cookies) hits Google's login wall every single time and dies. Google actively blocks automated login on clean sessions. There's no way around it without a browser that's already authenticated.

A persistent profile at `~/chrome-qa-profile` — outside Chrome's default directory — lets you log in once. Every test after that reuses the live session. OAuth flows complete normally because Chrome already has your credentials.

**Reason 2: Chrome 136+ blocks CDP on the default profile**

Chrome 136 added a restriction: `--remote-debugging-port` is blocked for any profile inside `~/Library/Application Support/Google/Chrome/`. Error:

```
DevTools remote debugging requires a non-default data directory
```

Every guide online misses this. The fix is the same persistent external profile — it sidesteps both problems at once.

---

## Install

### Claude Code

```bash
git clone https://github.com/Rolync217/live-browser-qa ~/.claude/skills/live-browser-qa
```

Done. Claude Code auto-discovers skills in `~/.claude/skills/`. Triggers on "test this", "verify the flow", "show me it working", or explicitly via `/live-browser-qa`.

### Codex CLI / Cursor / Windsurf / other agents

Clone the repo anywhere:

```bash
git clone https://github.com/Rolync217/live-browser-qa ~/live-browser-qa
```

Then either:
- Copy the contents of `SKILL.md` into your `AGENTS.md` / agent rules file
- Or tell your agent: *"Follow the instructions in `~/live-browser-qa/SKILL.md` to set up and run browser QA"*

### Staying up to date

Chrome version changes and edge cases get fixed as they're found:

```bash
git -C ~/.claude/skills/live-browser-qa pull
# or wherever you cloned it:
git -C ~/live-browser-qa pull
```

---

## Requirements

- macOS or Linux
- Google Chrome installed
- Node.js
- Any AI coding agent

---

## License

MIT
