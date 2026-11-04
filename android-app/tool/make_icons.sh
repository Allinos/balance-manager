#!/usr/bin/env bash
# Launcher icons, splash logo and Play Store graphics for DocGen for Android, made from the DocGen logo
# (document-generator/assets/app-icon.png, 1024 px). Needs ImageMagick. Run again after changing the logo:
#   bash tool/make_icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=../document-generator/assets/app-icon.png
RES=android/app/src/main/res
BG='#0040D4'          # the logo's blue, behind the adaptive icon
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# The logo's rounded blue square, trimmed of its transparent border.
convert "$SRC" -trim +repage -gravity center -background none -extent 980x980 "$TMP/logo.png"
# Square with flat blue corners (for the round icon and the Play Store icon).
convert -size 980x980 xc:"$BG" "$TMP/logo.png" -composite "$TMP/square.png"

declare -A DENS=([mdpi]=1 [hdpi]=1.5 [xhdpi]=2 [xxhdpi]=3 [xxxhdpi]=4)
for d in "${!DENS[@]}"; do
  f=${DENS[$d]}
  px() { python3 -c "print(round($1*$f))"; }
  mkdir -p "$RES/mipmap-$d"
  # Legacy icon (Android 7): the logo on 48 dp, a little margin.
  s=$(px 48); in=$(px 44)
  convert "$TMP/logo.png" -resize "${in}x${in}" -gravity center -background none -extent "${s}x${s}" "$RES/mipmap-$d/ic_launcher.png"
  # Legacy round icon.
  convert "$TMP/square.png" -resize "${s}x${s}" \( -size "${s}x${s}" xc:none -fill white -draw "circle $((s/2)),$((s/2)) $((s/2)),1" \) -compose DstIn -composite "$RES/mipmap-$d/ic_launcher_round.png"
  # Adaptive foreground (Android 8+): 108 dp canvas, the blue square 80 dp so the visible 72 dp is all logo.
  s=$(px 108); in=$(px 80)
  convert "$TMP/logo.png" -resize "${in}x${in}" -gravity center -background none -extent "${s}x${s}" "$RES/mipmap-$d/ic_launcher_foreground.png"
  # Splash logo (Android 7–11): 120 dp.
  s=$(px 120); in=$(px 112)
  convert "$TMP/logo.png" -resize "${in}x${in}" -gravity center -background none -extent "${s}x${s}" "$RES/mipmap-$d/launch_image.png"
done

# Google Play: 512 × 512 icon (square; Play rounds the corners) and the 1024 × 500 feature graphic.
mkdir -p store
convert "$TMP/square.png" -resize 512x512 -strip "store/play-icon-512.png"
convert -size 1024x500 gradient:'#0a3fc9'-'#062a8c' \
  \( "$TMP/logo.png" -resize 360x360 \) -gravity west -geometry +70+0 -composite \
  -font Inter-Bold -fill white -pointsize 84 -gravity northwest -annotate +480+120 'DocGen' \
  -font Inter-Regular -fill '#dbe5ff' -pointsize 34 -annotate +484+232 'GST invoices, retail bills' \
  -annotate +484+278 'and payments on your phone' \
  -fill '#ffc76a' -pointsize 28 -annotate +484+346 'Free to start · Works offline' \
  -strip "store/feature-graphic-1024x500.png"
echo "Icons written to $RES and store/"
