#!/bin/bash
# Start a dedicated QA Chrome with CDP enabled on port 9222.
# Uses a SEPARATE profile (~/chrome-qa-profile) — intentionally isolated
# from your real Chrome. The tool only sees what you log into here.
# Re-running is safe — exits immediately if already running.
#
# Chrome's single-instance check is per --user-data-dir, so this launches
# alongside any existing regular Chrome window. No need to quit Chrome first.

PORT="${1:-9222}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
QA_PROFILE="$HOME/chrome-qa-profile"

# Already running — nothing to do
if curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "QA Chrome already running on port $PORT"
  exit 0
fi

# Launch QA Chrome alongside any existing regular Chrome window
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$QA_PROFILE" \
  --no-first-run \
  --no-default-browser-check \
  "about:blank" &>/dev/null &

sleep 5

# First-ever run: no cookies yet — prompt user to log in if needed
COOKIES="$QA_PROFILE/Default/Cookies"
if [ ! -f "$COOKIES" ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "FIRST RUN — one-time setup needed:"
  echo ""
  echo "The QA Chrome window just opened with a fresh profile."
  echo "If your test uses Google OAuth or any saved login:"
  echo "  → Switch to the QA Chrome window"
  echo "  → Log into the account(s) your app uses"
  echo "  → Come back here and press Enter"
  echo ""
  echo "This only happens once. The session persists forever."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  read -rp "Press Enter when done (or if no login needed)..."
fi

# Confirm CDP is ready
if curl -s "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "QA Chrome ready on port $PORT"
else
  echo "CDP not responding after launch. Wait a few seconds and retry."
  exit 1
fi
