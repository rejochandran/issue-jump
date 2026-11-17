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

shot 1-recent "scene=default&h=Jump%20to%20any%20issue&p=Press%20Alt%2BJ%2C%20type%20a%20key%20or%20just%20the%20number%2C%20hit%20Enter.%20Jira%2C%20GitHub%2C%20GitLab%20and%20Linear%20in%20one%20place."
shot 2-preview "scene=default&q=431&h=See%20it%20before%20you%20open%20it&p=Title%20and%20status%20appear%20as%20you%20type%2C%20straight%20from%20your%20tracker."
shot 3-search "scene=default&q=checkout&h=Search%20every%20tracker%20at%20once&p=Don%E2%80%99t%20know%20the%20key%3F%20Type%20a%20few%20words%20and%20pick%20from%20all%20of%20them."
shot 4-many "scene=default&q=WEB-412%2C%20acme/web%23198%2C%20ENG-58&h=Paste%20a%20whole%20list&p=Keys%2C%20links%20and%20branch%20names%20all%20work.%20Each%20one%20goes%20to%20the%20right%20tracker."
shot 5-settings "scene=default&view=settings&h=Sets%20itself%20up&p=Finds%20the%20trackers%20open%20in%20your%20tabs.%20Nothing%20is%20collected%20and%20nothing%20leaves%20your%20browser."

rsvg-convert -w 440 -h 280 store/promo-small.svg -o store/promo-small-440x280.png
rsvg-convert -w 1400 -h 560 store/promo-marquee.svg -o store/promo-marquee-1400x560.png
echo "store/promo-small-440x280.png"; echo "store/promo-marquee-1400x560.png"
