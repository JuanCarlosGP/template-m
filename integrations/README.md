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
| GitHub Actions | [`github-actions/headless.yml`](github-actions/headless.yml) | `.github/workflows/e2e-headless.yml` |
| Azure Pipelines | [`azure-pipelines/headless.yml`](azure-pipelines/headless.yml) | `azure-pipelines.yml` or a template stage |
| GitLab CI | [`gitlab-ci/headless.yml`](gitlab-ci/headless.yml) | `.gitlab-ci.yml` or `include:` |

Adjust triggers, branch names, and Node version if needed. Requires **Node 20+** and a committed `package-lock.json` for `npm ci`.

## Device jobs (phase 2)

These examples do **not** run Maestro on a simulator/emulator. When you add a device job, see [`docs/CI.md`](../docs/CI.md#device-gate-optional) and publish `reports/junit.xml` + `reports/summary.json` as artifacts.
