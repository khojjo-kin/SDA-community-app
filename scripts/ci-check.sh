#!/bin/bash
# Installs packages, type-checks and bundles the app. Writes everything to $LOG_DIR.
set -u
LOG_DIR="${LOG_DIR:-$RUNNER_TEMP/logs}"
mkdir -p "$LOG_DIR"
echo "started $(date -u +%FT%TZ)" > "$LOG_DIR/status.txt"
node -v >> "$LOG_DIR/status.txt"; npm -v >> "$LOG_DIR/status.txt"

npm install --no-audit --no-fund > "$LOG_DIR/npm-install.log" 2>&1
echo "npm install: $?" >> "$LOG_DIR/status.txt"
[ -f package-lock.json ] && cp package-lock.json "$LOG_DIR/package-lock.json"

npx expo install --check > "$LOG_DIR/expo-check.log" 2>&1
echo "expo install --check: $?" >> "$LOG_DIR/status.txt"

npx tsc --noEmit > "$LOG_DIR/tsc.log" 2>&1
echo "tsc: $?" >> "$LOG_DIR/status.txt"

npx expo export --platform ios --output-dir .export-check > "$LOG_DIR/export.log" 2>&1
code=$?
echo "expo export: $code" >> "$LOG_DIR/status.txt"
echo "finished $(date -u +%FT%TZ)" >> "$LOG_DIR/status.txt"
exit $code
