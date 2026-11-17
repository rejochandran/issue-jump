#!/bin/sh
# Regenerates the screenshots used in the wiki (wiki/images/) from the preview harness.
# Needs Google Chrome and Python 3 with Pillow. Run: npm run wiki:shots
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT=8792
PORT=$PORT node tools/preview/server.mjs >/dev/null &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
mkdir -p wiki/images

shot() { # name, query string
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=400,900 --virtual-time-budget=4000 --screenshot="wiki/images/$1.png" \
    "http://localhost:$PORT/__doc.html?$2" >/dev/null 2>&1
  # Crop away the key colour below the popup and add a hairline border.
  python3 - "wiki/images/$1.png" <<'PY'
import sys
from PIL import Image, ImageOps
path = sys.argv[1]
img = Image.open(path).convert('RGB')
w, h = img.size
px = img.load()
bottom = h
while bottom > 1 and px[w // 2, bottom - 1] == (255, 0, 255) and px[4, bottom - 1] == (255, 0, 255):
    bottom -= 1
img = img.crop((0, 0, w, bottom))
ImageOps.expand(img, border=2, fill=(208, 212, 218)).save(path, optimize=True)
PY
  echo "wiki/images/$1.png"
}

shot popup            "scene=default"
shot preview          "scene=default&q=431"
shot search           "scene=default&q=checkout"
shot several          "scene=default&q=WEB-412%2C%20acme%2Fweb%23198%2C%20ENG-58"
shot two-trackers     "scene=default&q=OPS-88"
shot assigned         "scene=default&list=mine&tab=blank"
shot first-run        "scene=setup"
shot first-run-found  "scene=setup&found=1"
shot welcome          "scene=empty&tab=blank"
shot settings         "scene=default&view=settings"
shot add-tracker      "scene=default&view=add"
shot tracker-jira     "scene=default&view=tracker&n=0"
shot tracker-github   "scene=default&view=tracker&n=1"
shot tracker-linear   "scene=default&view=tracker&n=2"
shot tracker-gitlab   "scene=default&view=add&type=gitlab"
shot tracker-custom   "scene=default&view=add&type=custom"
shot no-project       "scene=noproject&guess=0&q=122"
shot signed-out       "scene=signedout"
