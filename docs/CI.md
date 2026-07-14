# CI — Izertis Maestro Template

This template does **not** ship an official pipeline. Use any CI that can run Node 20 and shell commands. Copy an example from [`integrations/`](../integrations/README.md) or wire the contract below into your client's stack.

Agent-authored tests follow [`docs/agent/workflow.md`](agent/workflow.md); CI typically gates **static** quality on every PR and **device** runs separately.

## Headless gate (every PR)

No device or app binary required. Suitable for GitHub Actions, Azure Pipelines, GitLab CI, Jenkins, etc.

```bash
npm ci
npm run check
```

`npm run check` runs, in order:

1. **`npm test`** — unit tests (`maestro/scripts/lib/*.test.js`)
2. **`npm run validate`** — Gherkin, step-definitions schema, flows
3. **`gherkin-extract`** — fails if `pasosSinDefinicion > 0`

## Device gate (optional)

Run on a macOS/Linux agent with a booted simulator/emulator and the app installed:

```bash
npm run feature:expand-bank-login
# o:
npm run feature -- --feature maestro/features/AppiumPracticeExpandBank.feature --platform android --no-publish
```

Publish execution artifacts from the run (see below).

## Execution reports (post-run)

After `gherkin-runner` completes, the default output directory is `reports/` (override with `REPORT_DIR` in `.env` or `--report-dir`):

| File | Purpose |
|------|---------|
| `reports/summary.json` | Structured pass/fail per scenario and platform |
| `reports/junit.xml` | Standard JUnit for CI test tabs |

Disable with `--no-reports` when iterating locally.

These are **run results**, not the static Gherkin catalog. For step inventory and authoring, use [`maestro/scripts/gherkin-dictionary/`](../maestro/scripts/gherkin-dictionary/).

## Optional integrations

Configure in `.env` only if the client uses them:

| Integration | Variables | Script |
|-------------|-----------|--------|
| Azure Test Plans | `AZURE_DEVOPS_*`, `AZURE_TEST_PLAN_ID`, `AZURE_TEST_SUITE_ID` | `publish-results.js` (runner, unless `--no-publish`) |
| BrowserStack | `BROWSERSTACK_*` | `gherkin-runner --executor browserstack` |
| Maestro Cloud | (client-specific) | direct Maestro CLI |

## Example pipelines

| Stack | Example file |
|-------|----------------|
| GitHub Actions | [`integrations/github-actions/headless.yml`](../integrations/github-actions/headless.yml) |
| Azure Pipelines | [`integrations/azure-pipelines/headless.yml`](../integrations/azure-pipelines/headless.yml) |
| GitLab CI | [`integrations/gitlab-ci/headless.yml`](../integrations/gitlab-ci/headless.yml) |

Copy the file into the client's repo and adjust triggers, Node version, and artifact paths as needed.

## Device job artifact (optional)

When you add a device job, publish:

```yaml
# pseudo — adapt to your CI syntax
artifacts:
  - reports/junit.xml
  - reports/summary.json
```

Screenshots remain on the agent path referenced in `summary.json` unless you copy them into the artifact folder in a post-step.
