#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR"

WEB_DIR="apps/web"
ANDROID_DIR="$WEB_DIR/android"
GRADLE_USER_HOME="$ANDROID_DIR/.gradle-user-home"

echo "## NeuroDual Android Dev App (debug install)"
echo "- root: $ROOT_DIR"
echo "- gradle user home: $GRADLE_USER_HOME"
echo

echo "## Clean"
rm -rf "$WEB_DIR/dist"
rm -rf "$ANDROID_DIR/app/src/main/assets/public"

echo "## Build web (native mode + dev app overrides)"
bun run --filter @neurodual/web build:native:devapp

echo "## Sync Capacitor Android"
(cd "$WEB_DIR" && bunx cap sync android)

echo "## Gradle installDebug"

echo "- Seeding Gradle distribution cache (avoids network + ~/.gradle writes in sandbox)"
WRAPPER_PROPS="$ANDROID_DIR/gradle/wrapper/gradle-wrapper.properties"
DIST_URL="$(rg -N '^distributionUrl=' "$WRAPPER_PROPS" | sed -E 's/^distributionUrl=//')"
DIST_ZIP="$(basename "$DIST_URL")"
DIST_DIR="${DIST_ZIP%.zip}"
SRC_DISTS_DIR="$HOME/.gradle/wrapper/dists/$DIST_DIR"
DEST_DISTS_DIR="$GRADLE_USER_HOME/wrapper/dists/$DIST_DIR"

mkdir -p "$GRADLE_USER_HOME/wrapper/dists"
if [[ -d "$SRC_DISTS_DIR" ]]; then
  needs_seed="0"
  if [[ ! -d "$DEST_DISTS_DIR" ]]; then
    needs_seed="1"
  elif ! find "$DEST_DISTS_DIR" -maxdepth 3 -type d -name 'gradle-*' -print -quit | rg -q .; then
    needs_seed="1"
  fi

  if [[ "$needs_seed" == "1" ]]; then
    rm -rf "$DEST_DISTS_DIR"
    cp -a "$SRC_DISTS_DIR" "$GRADLE_USER_HOME/wrapper/dists/"
  fi
fi

(cd "$ANDROID_DIR" && ./gradlew --gradle-user-home ".gradle-user-home" :app:installDebug)

echo "OK: Dev app installed (debug)."
