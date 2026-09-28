#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ICON_SVG="assets/app-icons/app-icon.svg"
ICON_PNG="assets/app-icons/app-icon-1024.png"

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 1024 -h 1024 "$ICON_SVG" -o "$ICON_PNG"
fi

if [[ -d ios/App/App/Assets.xcassets/AppIcon.appiconset ]]; then
  cp "$ICON_PNG" ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
fi

if command -v rsvg-convert >/dev/null 2>&1 && [[ -d android/app/src/main/res ]]; then
  for spec in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
    density=${spec%%:*}; rest=${spec#*:}; base=${rest%%:*}; foreground=${rest##*:}
    directory="android/app/src/main/res/mipmap-${density}"
    rsvg-convert -w "$base" -h "$base" "$ICON_SVG" -o "$directory/ic_launcher.png"
    rsvg-convert -w "$base" -h "$base" "$ICON_SVG" -o "$directory/ic_launcher_round.png"
    rsvg-convert -w "$foreground" -h "$foreground" "$ICON_SVG" -o "$directory/ic_launcher_foreground.png"
  done
fi

