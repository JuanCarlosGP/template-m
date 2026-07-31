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
npm run feature -- --feature maestro/features/<Area>.feature --platform android --no-publish
# or all features:
npm run feature -- --feature-dir maestro/features --platform android --no-publish
```

### GitHub Actions — hosted Android emulator

Without BrowserStack, you can boot an AVD on `ubuntu-latest` (KVM + [`reactivecircus/android-emulator-runner`](https://github.com/ReactiveCircus/android-emulator-runner)), install the APK, and run the Gherkin suite.

- Live workflow: [`.github/workflows/e2e-android-emulator.yml`](../.github/workflows/e2e-android-emulator.yml) (`cron` nightly + manual `workflow_dispatch`)
- Copyable example: [`integrations/github-actions/android-emulator.yml`](../integrations/github-actions/android-emulator.yml)

Expect longer jobs and more flakiness than a local emulator or a device farm (especially scenarios that open an external browser / live website). Prefer self-hosted or cloud devices for critical gates.

Publish execution artifacts from the run (see below).

## Execution reports (post-run)

After `gherkin-runner` completes, the default output directory is `reports/` (override with `REPORT_DIR` in `.env` or `--report-dir`):

| File | Purpose |
|------|---------|
| `reports/summary.json` | Playwright-oriented **`JSONReport`** shape (`config`, `suites` → `specs` → `tests` → `results`, `stats`) for tooling interoperability |
| `reports/junit.xml` | Standard JUnit for CI test tabs (`time`, `classname`, failures) |
| `reports/index.html` | Local HTML viewer (open in browser after a run) |

`summary.json` follows Playwright’s JSON reporter nesting as closely as practical (including `stats.expected` / `unexpected` / `flaky` / `skipped`). Maestro extras (flows, feature file) ride in test annotations (`maestro.flows`, `maestro.featureFile`). It is **not** a Playwright Trace and will **not** open in `playwright show-report` / [trace.playwright.dev](https://trace.playwright.dev/) (those need Playwright’s blob/trace pipeline).

The HTML viewer template is versioned at `maestro/scripts/report-viewer/template.html`; each run writes a self-contained `reports/index.html` with an **internal** payload embedded (same look as before — not the on-disk Playwright JSON). Works with `file://`.

Disable with `--no-reports` when iterating locally.

These are **run results**, not the static Gherkin catalog. For step inventory and authoring, use [`maestro/scripts/gherkin-dictionary/`](../maestro/scripts/gherkin-dictionary/).

## Optional integrations

Configure in `.env` only if the client uses them:

| Integration | Variables | Script |
|-------------|-----------|--------|
| Azure Test Plans | `AZURE_DEVOPS_*`, `AZURE_TEST_PLAN_ID`, `AZURE_TEST_SUITE_ID` | `publish-results.js` (runner, unless `--no-publish`) |
| BrowserStack | `BROWSERSTACK_*` | `gherkin-runner --executor browserstack` |
| Maestro Cloud | (client-specific) | direct Maestro CLI |
| CI failure triage (optional) | `AGENT_API_KEY`, `AGENT_PROVIDER`, `AGENT_MAESTRO_MCP` | [`maestro/scripts/ci/`](../maestro/scripts/ci/) — report-only (no code edits/PRs); may use Maestro MCP while the AVD is still up; writes a short **Solución sugerida** into the Job Summary |

## Example pipelines

| Stack | Example file |
|-------|----------------|
| GitHub Actions (headless) | [`integrations/github-actions/headless.yml`](../integrations/github-actions/headless.yml) |
| GitHub Actions (Android emulator) | [`integrations/github-actions/android-emulator.yml`](../integrations/github-actions/android-emulator.yml) |
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
  - reports/index.html
```

Screenshots remain on the agent path referenced in `summary.json` unless you copy them into the artifact folder in a post-step.
