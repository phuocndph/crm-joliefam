#!/bin/sh
# Check a VPS web build before packaging, and the live page after deploying.
# Usage: scripts/check-vps-web-build.sh <dist-dir> [live-url]
# Incident 2026-11-11: web was built with "vite build" instead of "npm run build:vps",
# so VITE_BACKEND_MODE=local was missing and crm.joliefam.vn showed a blank page for ~15h.
DIST="${1:?missing dist dir}"; URL="${2:-}"; BROWSER="${CHROMIUM:-chromium-browser}"
if grep -l 'Missing VITE_SUPABASE_URL' "$DIST"/assets/*.js >/dev/null 2>&1; then
  echo "FAIL: dist was not built in VPS mode. Rebuild with: npm run build:vps"; exit 1; fi
echo "OK: dist built in VPS mode"
if [ -n "$URL" ]; then
  OUT=$(timeout 60 "$BROWSER" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=15000 --dump-dom "$URL" 2>/dev/null)
  if echo "$OUT" | grep -q 'Mật khẩu'; then echo "OK: live page renders the login form"
  else echo "FAIL: live page does not render the login form"; exit 1; fi
fi
