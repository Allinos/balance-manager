#!/usr/bin/env bash
# Builds the DocGen mobile web app (server/mobile) and copies it into this Flutter app's assets.
# Run before `flutter build apk` (the CI workflow does it): ./tool/build_web.sh
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$here/.." && pwd)"
(cd "$repo/server" && npm ci --no-audit --no-fund >/dev/null && npm run build -w mobile >/dev/null)
rm -rf "$here/assets/web/app"
mkdir -p "$here/assets/web/app"
# The service worker and the install manifest are for the browser only.
cp -r "$repo/server/mobile/dist/assets" "$repo/server/mobile/dist/icons" "$repo/server/mobile/dist/index.html" "$here/assets/web/app/"
echo "Web app copied to android-app/assets/web/app"
