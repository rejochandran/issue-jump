#!/bin/sh
# Renders extension/icons/icon.svg to the PNG sizes Chrome needs. Requires rsvg-convert (librsvg).
#   npm run icons                          re-render the current icon
#   npm run icons -- design/icons/e-chevrons.svg    switch to another design first
set -e
cd "$(dirname "$0")/.."
[ -n "$1" ] && cp "$1" extension/icons/icon.svg
for size in 16 32 48 128; do
  rsvg-convert -w "$size" -h "$size" extension/icons/icon.svg -o "extension/icons/icon$size.png"
done
echo "Rendered extension/icons/icon{16,32,48,128}.png"
