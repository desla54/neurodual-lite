#!/usr/bin/env bash
set -euo pipefail

# ─── Screenshot tool for Google Play Store ───
# Usage: ./screenshot.sh <name> <title> <subtitle> [dark]
#
# Examples:
#   ./screenshot.sh 1_journey "Adaptive Journey" "Progress from N-2 to N-5"
#   ./screenshot.sh 8_game_dark "Dark Mode" "Easy on the eyes" dark

ADB="/home/desla54/Android/Sdk/platform-tools/adb -s emulator-5554"

NAME="${1:?Usage: screenshot.sh <name> <title> <subtitle> [dark]}"
TITLE="${2:?Missing title}"
SUBTITLE="${3:?Missing subtitle}"
THEME="${4:-light}"

# Output
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/screenshots"
mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/${NAME}_raw.png"
FINAL="$OUT_DIR/${NAME}.png"

# Dimensions
WIDTH=1440
TOTAL_HEIGHT=3200
BANNER_HEIGHT=250
STATUS_BAR=84
CROP_HEIGHT=$((TOTAL_HEIGHT - STATUS_BAR))

# Theme colors
if [[ "$THEME" == "dark" ]]; then
  BG_COLOR="#171512"
  TITLE_COLOR="#F3F0EB"
  SUB_COLOR="#A8A49D"
else
  BG_COLOR="#E7E4DD"
  TITLE_COLOR="#1E1E1E"
  SUB_COLOR="#6B6660"
fi

# Font
FONT_BOLD="/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
FONT_REG="/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"

echo "📸 Capturing screen..."
$ADB exec-out screencap -p > "$RAW"

echo "🎨 Composing final image..."
magick "$RAW" \
  -crop "${WIDTH}x${CROP_HEIGHT}+0+${STATUS_BAR}" +repage \
  \( -size "${WIDTH}x${BANNER_HEIGHT}" xc:"${BG_COLOR}" \
     -font "$FONT_BOLD" -pointsize 64 -fill "$TITLE_COLOR" \
     -gravity center -annotate +0-30 "$TITLE" \
     -font "$FONT_REG" -pointsize 36 -fill "$SUB_COLOR" \
     -gravity center -annotate +0+40 "$SUBTITLE" \
  \) \
  +swap -append \
  -resize "${WIDTH}x${TOTAL_HEIGHT}!" \
  "$FINAL"

rm "$RAW"

echo "✅ $FINAL ($(identify -format '%wx%h' "$FINAL"))"
