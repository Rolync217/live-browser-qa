# live-browser-qa

A [Claude Code](https://claude.ai/code) skill that drives a real, visible Chrome for UI testing — no test scripts to write, no Selenium boilerplate, no pixel coordinates. Tell Claude what to test; it figures out the rest from the live page.

## Who is this for?

**Solo devs and indie hackers** who want Claude Code to verify that their UI actually works — without maintaining a Playwright test suite.

Specifically useful if you:
- Build web apps and want to manually QA flows (login, forms, dashboards) without writing tests
- Use Claude Code to ship features and want it to verify the golden path before you call it done
- Have hit the Chrome 136+ CDP error (`DevTools remote debugging requires a non-default data directory`) and lost hours debugging it
- Need to test scroll animations (GSAP ScrollTrigger, Framer Motion) and want them tested correctly — with real wheel events, not instant jumps that lie

**Not for:** teams running CI pipelines or needing headless automation at scale. This is for you watching Chrome do the thing while Claude drives it.

## What it does

- Launches a dedicated QA Chrome alongside your normal one — separate profile, doesn't touch your browsing
- Handles the Chrome 136+ CDP block automatically (the `--user-data-dir` fix)
- Attaches Playwright over CDP and interacts by element meaning: `getByRole('button', { name: 'Sign in' })` — not brittle CSS selectors
- Screenshots after every step so you see exactly what happened
- Tests scroll-linked animations correctly using real mouse wheel events (Framer Motion `useScroll`, GSAP ScrollTrigger, Lenis — these all lie on instant `window.scrollTo` jumps)
- Falls back to puppeteer-core if your Playwright version hits a known CDP context bug

## Install

```bash
git clone https://github.com/anandabhinav/live-browser-qa ~/.claude/skills/live-browser-qa
```

That's it. Claude Code auto-discovers skills in `~/.claude/skills/`. Available immediately in your next session.

### Staying up to date

Chrome updates and edge cases get fixed as they're found. Pull updates any time:

```bash
git -C ~/.claude/skills/live-browser-qa pull
```

## Usage

In Claude Code, just describe what you want tested in plain language:

- *"Test the login flow"*
- *"Verify the dashboard loads after sign-in"*
- *"Check if the signup form validates email correctly"*
- *"Show me the onboarding flow working"*

Or invoke explicitly with `/live-browser-qa`.

## The problem it solves

Chrome 136+ blocks `--remote-debugging-port` for any profile inside the default Chrome directory. The error:

```
DevTools remote debugging requires a non-default data directory
```

...is cryptic, the StackOverflow answers don't cover it, and it breaks every guide on CDP-based automation. The fix is a persistent dedicated QA profile at `~/chrome-qa-profile` outside the default dir. This skill handles that automatically.

## Requirements

- macOS or Linux
- Google Chrome 136+
- Node.js
- Claude Code

## License

MIT
