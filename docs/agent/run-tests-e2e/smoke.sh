#!/usr/bin/env bash
# Headless smoke: validate static consistency + preflight.
# No device, no credentials needed. Exit 0 = suite is structurally sound.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "=== validate ==="
node --import tsx maestro/scripts/validate.ts

echo ""
echo "=== doctor ==="
node --import tsx maestro/scripts/doctor.ts
