#!/usr/bin/env bash
# Renders the Chrome Web Store screenshots and promo tile into ../store/.
# FIREFOX=1 renders firefox-screenshot-*.png for Firefox Add-ons instead.
# Needs Google Chrome and Python 3.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(cd .. && pwd)/store"
PORT=8799
mkdir -p "$OUT"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1

shot() { # name width height scene
  google-chrome --headless=new --disable-gpu --hide-scrollbars --force-color-profile=srgb \
    --user-data-dir="$(mktemp -d)" --virtual-time-budget=4000 \
    --window-size="$2,$3" --screenshot="$OUT/$1.png" \
    "http://127.0.0.1:$PORT/dev/store-shot.html?scene=$4${FIREFOX:+&firefox}" 2>/dev/null
}

if [ -n "${FIREFOX:-}" ]; then
  shot firefox-screenshot-1 1280 800 1
  shot firefox-screenshot-2 1280 800 2
  shot firefox-screenshot-3 1280 800 3
else
  shot screenshot-1 1280 800 1
  shot screenshot-2 1280 800 2
  shot screenshot-3 1280 800 3
  shot promo-small 440 280 promo
fi
ls -l "$OUT"/*.png
