# CI examples (copy into your project)

This folder contains **starter pipelines** for the headless quality gate. They are **not executed** from this template repo — copy one into your client's CI config.

## Contract

Every example runs:

```bash
npm ci
npm run check
```

`npm run check` runs unit tests, static validation, and strict Gherkin extract (no device or app binary required). See [`docs/CI.md`](../docs/CI.md) for details.

## Which file to copy

| Stack | Copy from | Typical destination |
|-------|-----------|---------------------|
| GitHub Actions (headless) | [`github-actions/headless.yml`](github-actions/headless.yml) | `.github/workflows/e2e-headless.yml` |
| GitHub Actions (Android emulator) | [`github-actions/android-emulator.yml`](github-actions/android-emulator.yml) | `.github/workflows/e2e-android-emulator.yml` |
| Azure Pipelines | [`azure-pipelines/headless.yml`](azure-pipelines/headless.yml) | `azure-pipelines.yml` or a template stage |
| GitLab CI | [`gitlab-ci/headless.yml`](gitlab-ci/headless.yml) | `.gitlab-ci.yml` or `include:` |

Adjust triggers, branch names, and Node version if needed. Requires **Node 20+** and a committed `package-lock.json` for `npm ci`.

## Device jobs

- **Headless examples** do not run Maestro on a device.
- **Android emulator (GitHub-hosted):** [`github-actions/android-emulator.yml`](github-actions/android-emulator.yml) boots an AVD, installs the demo APK, and runs `maestro/features`. This template also keeps a live copy at [`.github/workflows/e2e-android-emulator.yml`](../.github/workflows/e2e-android-emulator.yml) (`schedule` + `workflow_dispatch`). Slow and flaky vs cloud/self-hosted; use for smoke, not as the only production gate.
- Publish `reports/junit.xml` + `reports/summary.json` (+ `index.html`) as artifacts — see [`docs/CI.md`](../docs/CI.md#device-gate-optional).
