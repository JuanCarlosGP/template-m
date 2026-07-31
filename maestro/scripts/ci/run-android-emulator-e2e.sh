#!/usr/bin/env bash
# Single entry for GitHub android-emulator-runner (one process — env vars survive).
# Runs features, collects screenshots, writes Job Summary, and on failure may triage
# with Maestro MCP while the AVD is still up. Does not edit repo files.
set -u

export PATH="${HOME}/.maestro/bin:${PATH}"

maestro --version
adb devices -l
adb install -r build/android/demo.apk
adb shell 'echo "chrome --disable-fre --no-first-run --no-default-browser-check" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome

set +e
npm run feature -- --feature-dir maestro/features --platform android --android-app-id "${ANDROID_APP_ID}" --no-publish
FEATURE_EXIT=$?
set -e

mkdir -p reports/maestro-screenshots
if [ -d "${HOME}/.maestro/tests" ]; then
  cp -a "${HOME}/.maestro/tests/." reports/maestro-screenshots/
  echo "Copied Maestro test artifacts:"
  find reports/maestro-screenshots -type f | head -n 50
else
  echo "No ${HOME}/.maestro/tests directory (no Maestro run artifacts)"
fi

node maestro/scripts/ci/write-summary.js

if [ "${FEATURE_EXIT}" -ne 0 ] && [ -n "${AGENT_API_KEY:-}" ]; then
  echo "Running report-only agent triage (Maestro MCP while device is up)..."
  # Soft-fail: triage must not hide the real E2E exit code.
  node maestro/scripts/ci/triage-failure.js || echo "Triage step returned non-zero (ignored)"
fi

exit "${FEATURE_EXIT}"
