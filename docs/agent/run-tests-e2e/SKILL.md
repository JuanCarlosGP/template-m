---
name: run-tests-e2e
description: Run, validate, or smoke-test the Izertis Maestro Template Maestro suite. Use when asked to run, start, validate, check, smoke-test, or take a screenshot of the E2E suite. Covers the headless smoke path (no device) and device runs for iOS and Android.
---

This project is the **Izertis Maestro Template** — a Maestro E2E test suite (CLI tool, not a GUI). The "app to run" is
the runner pipeline: `validate` → `doctor` → `npm run feature|flow:ios|flow:android`.

The agent path is `docs/agent/run-tests-e2e/smoke.sh` — runs the two headless checks
that require no device and no app binary.

## Prerequisites

Node ≥ 20, Maestro CLI 2.x on PATH (installed via `npm run setup` on Unix, or manually on Windows).

```
npm run setup       # bootstrap (once)
# or: npm install
```

## Agent path — headless smoke (no device needed)

```bash
bash docs/agent/run-tests-e2e/smoke.sh
```

Exit 0 = feature files, step-definitions, and flows are all structurally consistent AND
the machine meets hard requirements (Node, Maestro, adb/xcrun). The `APP_SOURCE_DIR not
found` warning is expected when `your-mobile-app` is not checked out locally — it's a soft
warning, not a failure.

Alternatively: `npm run check` (unit tests + validate + gherkin-extract strict).

## Device runs — human / CI path

Requires a booted iOS simulator or Android emulator with the app installed, and `.env`
filled in (copy from `.env.example`, add `USERNAME`, `PASSWORD`, `AZURE_DEVOPS_PAT`).

```bash
# Static check only (no device)
npm run validate

# Preflight (checks toolchain + devices)
npm run doctor

# Example: launch My Demo App directly
npm run flow:android -- --flow maestro/flows/OpenApp.yml

# Single feature (generic)
npm run feature -- --feature maestro/features/<Area>.feature --platform android --no-publish
```

Pass `--no-publish` to keep results off Azure.

## Gotchas

- **`npm run feature` needs `AZURE_TEST_PLAN_ID` and `AZURE_TEST_SUITE_ID`** from `.env` when publishing (`PLAN_ID` / `SUITE_ID` work as legacy aliases). For local runs use `--no-publish`.
- **The Azure DevOps MCP uses browser auth, not the PAT in `.env`**. `AZURE_DEVOPS_PAT`
  in `.env` is only for `publish-results.js`. Don't confuse the two.
- **`APP_SOURCE_DIR` warning is harmless** unless you're authoring a new test and need
  to discover `testID` selectors from the app source. Set it in `.env` to point
  at a local checkout (`../your-mobile-app` or another worktree).
- **`npm run validate` exits 0 even with no `.env`** — it's a pure static parse. `npm run
  doctor` is the one that checks env and devices.
