#!/usr/bin/env bash
set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
# Max AAB size in MB (upload file, including proguard.map metadata).
# Play Store delivery is smaller — this catches bloat before upload.
AAB_MAX_MB=45

# Patterns that must NEVER appear in the final AAB.
# Checked against the full entry path from `unzip -l`.
FORBIDDEN_PATTERNS=(
  '\.wasm$'                    # wa-sqlite WASM — web-only, Android uses SQLCipher
  'base/assets/.*\.map$'       # JS sourcemaps — proguard.map in BUNDLE-METADATA is fine
  'base/lib/x86/'              # x86 native libs — emulator only
  'base/lib/x86_64/'           # x86_64 native libs — emulator only
)

# ─── Paths ───────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_DIR="apps/web"
ANDROID_DIR="$WEB_DIR/android"
ASSETS_DIR="$ANDROID_DIR/app/src/main/assets/public"
GRADLE_USER_HOME="$ANDROID_DIR/.gradle-user-home"
AAB_PATH="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
MAPPING_PATH="$ANDROID_DIR/app/build/outputs/mapping/release/mapping.txt"

errors=0
err() { echo "ERROR: $*" >&2; errors=$((errors + 1)); }

echo "## NeuroDual Android AAB (release)"
echo "- root: $ROOT_DIR"
echo "- gradle user home: $GRADLE_USER_HOME"
echo

# ─── 1. Clean ────────────────────────────────────────────────────────────────
echo "## Clean"
rm -rf "$WEB_DIR/dist"
rm -rf "$ASSETS_DIR"

# ─── 2. Build web ────────────────────────────────────────────────────────────
echo "## Build web (native mode)"
bun run --filter @neurodual/web build:native

if find "$WEB_DIR/dist" -name '*.map' -print -quit 2>/dev/null | grep -q .; then
  err "Sourcemaps found in $WEB_DIR/dist after build:native"
  find "$WEB_DIR/dist" -name '*.map' | head -20 >&2
  exit 1
fi

# ─── 3. Capacitor sync ──────────────────────────────────────────────────────
echo "## Sync Capacitor Android"
(cd "$WEB_DIR" && bunx cap sync android)

# ─── 4. Strip web-only assets ────────────────────────────────────────────────
echo "## Strip web-only assets from Android bundle"
strip_count=0
while IFS= read -r -d '' f; do
  echo "  rm ${f#"$ASSETS_DIR"/}"
  rm "$f"
  strip_count=$((strip_count + 1))
done < <(find "$ASSETS_DIR" \( -name '*.wasm' -o -name '*.map' \) -print0 2>/dev/null)
echo "  → stripped $strip_count file(s)"

# ─── 5. Gradle build ────────────────────────────────────────────────────────
echo "## Gradle bundleRelease"

# Seed Gradle distribution cache (avoids network + ~/.gradle writes)
WRAPPER_PROPS="$ANDROID_DIR/gradle/wrapper/gradle-wrapper.properties"
DIST_URL="$(grep '^distributionUrl=' "$WRAPPER_PROPS" | sed 's/^distributionUrl=//')"
DIST_ZIP="$(basename "$DIST_URL")"
DIST_DIR="${DIST_ZIP%.zip}"
SRC_DISTS_DIR="$HOME/.gradle/wrapper/dists/$DIST_DIR"
DEST_DISTS_DIR="$GRADLE_USER_HOME/wrapper/dists/$DIST_DIR"

mkdir -p "$GRADLE_USER_HOME/wrapper/dists"
if [[ -d "$SRC_DISTS_DIR" ]]; then
  needs_seed=0
  if [[ ! -d "$DEST_DISTS_DIR" ]]; then
    needs_seed=1
  elif ! find "$DEST_DISTS_DIR" -maxdepth 3 -type d -name 'gradle-*' -print -quit 2>/dev/null | grep -q .; then
    needs_seed=1
  fi
  if [[ "$needs_seed" == "1" ]]; then
    rm -rf "$DEST_DISTS_DIR"
    cp -a "$SRC_DISTS_DIR" "$GRADLE_USER_HOME/wrapper/dists/"
  fi
fi

(cd "$ANDROID_DIR" && ./gradlew --gradle-user-home ".gradle-user-home" :app:bundleRelease)

# ─── 6. Audit AAB ───────────────────────────────────────────────────────────
echo
echo "## AAB audit"

if [[ ! -f "$AAB_PATH" ]]; then
  err "AAB not found at $AAB_PATH"
  exit 1
fi

aab_bytes=$(stat -c%s "$AAB_PATH")
aab_mb=$(LC_NUMERIC=C awk "BEGIN {printf \"%.1f\", $aab_bytes / 1048576}")

echo "  size: ${aab_mb} MB (budget: ${AAB_MAX_MB} MB)"

# Size gate
if LC_NUMERIC=C awk "BEGIN {exit ($aab_mb > $AAB_MAX_MB) ? 0 : 1}"; then
  err "AAB is ${aab_mb} MB — exceeds ${AAB_MAX_MB} MB budget"
fi

# Forbidden patterns
aab_listing=$(unzip -l "$AAB_PATH")
for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  matches=$(echo "$aab_listing" | grep -cE "$pattern" || true)
  if [[ "$matches" -gt 0 ]]; then
    err "Found $matches file(s) matching forbidden pattern: $pattern"
    echo "$aab_listing" | grep -E "$pattern" | head -10 >&2
  fi
done

# ─── 7. Size breakdown ──────────────────────────────────────────────────────
echo
echo "## Size breakdown (compressed)"
python3 -c "
import zipfile, os, collections

aab = '$AAB_PATH'
cats = collections.OrderedDict([
    ('proguard.map', lambda n: 'proguard.map' in n),
    ('native libs',  lambda n: n.startswith('base/lib/')),
    ('DEX',          lambda n: n.endswith('.dex')),
    ('JS bundles',   lambda n: n.endswith('.js')),
    ('CSS',          lambda n: n.endswith('.css')),
    ('ML models',    lambda n: '/models/' in n),
    ('images/res',   lambda n: 'resources.pb' in n or '/res/' in n),
    ('other',        lambda n: True),
])

totals = {k: 0 for k in cats}
with zipfile.ZipFile(aab) as z:
    for e in z.infolist():
        for cat, test in cats.items():
            if test(e.filename):
                totals[cat] += e.compress_size
                break

total = sum(totals.values())
for cat, size in totals.items():
    if size > 0:
        pct = size / total * 100
        print(f'  {cat:<14} {size/1024/1024:>6.1f} MB  ({pct:4.1f}%)')
print(f'  {\"TOTAL\":<14} {total/1024/1024:>6.1f} MB')
"

# ─── 8. Output ───────────────────────────────────────────────────────────────
echo
if [[ -f "$MAPPING_PATH" ]]; then
  mapping_mb=$(LC_NUMERIC=C awk "BEGIN {printf \"%.0f\", $(stat -c%s "$MAPPING_PATH") / 1048576}")
  echo "  mapping.txt: ${mapping_mb} MB (upload separately to Play Console for crash symbolication)"
fi

if [[ "$errors" -gt 0 ]]; then
  echo
  echo "FAILED: $errors error(s) — fix before uploading to Play Store." >&2
  exit 1
fi

echo
echo "OK: $AAB_PATH"
echo "    Ready to upload to Google Play Console."
