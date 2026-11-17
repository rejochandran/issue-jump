#!/bin/sh
# Regenerates the Chrome Web Store screenshots (1280x800) and promo tile from the preview harness.
# Needs Google Chrome and rsvg-convert. Run: sh scripts/screenshots.sh
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT=8791
PORT=$PORT node tools/preview/server.mjs >/dev/null &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
mkdir -p store/screenshots

shot() { # name, query string
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 \
    --virtual-time-budget=4000 --screenshot="store/screenshots/$1.png" \
    "http://localhost:$PORT/__shot.html?$2" >/dev/null 2>&1
  echo "store/screenshots/$1.png"
}

shot 1-recent   "scene=default&h=Jump%20to%20any%20issue&p=Press%20Alt%2BJ%2C%20type%20a%20key%20or%20just%20the%20number%2C%20hit%20Enter.%20Recent%20and%20pinned%20issues%20are%20one%20arrow%20key%20away."
shot 2-preview  "scene=default&q=431&h=See%20it%20before%20you%20open%20it&p=Summary%20and%20status%20appear%20as%20you%20type%2C%20using%20the%20Jira%20login%20you%20already%20have."
shot 3-search   "scene=default&q=checkout&h=Don%E2%80%99t%20know%20the%20key%3F&p=Type%20a%20few%20words%20to%20search%20issues%20and%20projects%20without%20leaving%20the%20page%20you%E2%80%99re%20on."
shot 4-many     "scene=default&q=WEB-412%2C%20OPS-88%2C%20WEB-377&h=Paste%20a%20whole%20list&p=Keys%2C%20links%20and%20branch%20names%20all%20work.%20Several%20at%20once%20open%20side%20by%20side."
shot 5-settings "scene=default&view=settings&h=Sets%20itself%20up&p=Finds%20your%20Jira%20site%20from%20an%20open%20tab.%20Nothing%20is%20collected%20and%20nothing%20leaves%20your%20browser."

rsvg-convert -w 440 -h 280 store/promo-small.svg -o store/promo-small-440x280.png
rsvg-convert -w 1400 -h 560 store/promo-marquee.svg -o store/promo-marquee-1400x560.png
echo "store/promo-small-440x280.png"; echo "store/promo-marquee-1400x560.png"
