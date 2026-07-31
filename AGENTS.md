# Izertis Maestro Template — agent rules

E2E test **framework template** by **Izertis**, driven by **Maestro** and **Gherkin**. Uses fictional demo scenarios to illustrate the structure — replace them with real tests for your app.

Harness prose is in English; **generated test output (Gherkin scenarios, branch slugs) stays in Spanish** to match team conventions.

Optional AI playbooks live in [`docs/agent/`](docs/agent/README.md). End-to-end flow: [`docs/agent/workflow.md`](docs/agent/workflow.md) (issue → scout → plan → author → sanity). MCP setup: [`docs/agent/mcp-examples.md`](docs/agent/mcp-examples.md).

## Architecture

**Core** (works without Azure, CI vendor, or a real app in demo mode):

```
features ──► gherkin-runner.js ──► step-definitions/ ──► flows/*.yml ──► device
                  │
                  └──► reports/summary.json + junit.xml + index.html
```

**Optional — Azure Test Plans publish** (omit `--no-publish` and configure `.env`):

```
Azure Test Plans ──► gherkin-runner.js ──► … ──► device
        ▲                                              │
        └──────── publish-results.js ◄─────────────────┘
```

- **Features** (`maestro/features/*.feature`) — scenarios in Gherkin (Spanish).
- **Step definitions** (`maestro/step-definitions/*.json`) — map each Gherkin step to a
  Maestro flow name (or `null` when the step is a precondition/assertion handled inside
  another flow). `index.js` auto-discovers and merges every `*.json` in that directory.
- **Flows** (`maestro/flows/*.yml`) — the Maestro flow the runner invokes by name.
  `flows/X.yml` typically delegates to `shared/X.yml`, which branches per platform into
  `ios/` and `android/` flows via `runFlow: when: { platform: iOS | Android }`.
- **Runner** (`maestro/scripts/gherkin-runner.js`) — parses features, resolves steps,
  runs the flows on device, and (unless `--no-publish`) publishes results to Azure.

## Optional authoring (AI)

Not required for `npm run check`. When automating from a TMS ticket:

```
ticket → environment-scout → test-planner → e2e-specs/specs/<id>.md → author-e2e-test → sanity-reviewer → maestro/
```

Specs: [`e2e-specs/`](e2e-specs/README.md). Orchestration: [`docs/agent/workflow.md`](docs/agent/workflow.md).

## Example app (Sauce Labs My Demo App)

Target Android app: **[My Demo App](https://github.com/saucelabs/my-demo-app-android)** (`com.saucelabs.mydemoapp.android`).
Step-defs are split by area so the template shows how to scale: `common.json` (shared),
`auth.json`, `webview.json`, `about.json`. `index.js` merges every `*.json` automatically.

After fork, add tests for your app using the same layout — see [README § Tras crear tu proyecto](README.md#tras-crear-tu-proyecto).

## Conventions

- **One JSON per feature area** in `step-definitions/` (e.g. `auth.json`, `webview.json`).
  Put shared steps (`OpenApp`, assertions, navigation) in `common.json`.
  Add a new file for a new area — do not bloat existing ones.
- **Longest matching pattern wins.** Among all step definitions that match a Gherkin step,
  the runner picks the one with the longest `pattern`. Files load alphabetically, but array
  order within a JSON is not the tie-breaker. Prefer longer, more specific patterns; avoid
  near-duplicates (the Gherkin dictionary warns on ambiguity).
- **Parameterised steps** use a regex `pattern` plus a `params` array; the captured groups
  are passed to the flow as `--env` vars (e.g. `USERNAME`, `PASSWORD`).
- **Flow file shape:** `appId: ${APP_ID}` header, a `name:`, then `---`, then steps.
- **Platform-specific flows** live in `ios/` and `android/`; shared logic in `shared/`.
  The entry flow in `flows/` branches by platform. Cover **both iOS and Android**.
- **Never hardcode credentials** in tracked files. `USERNAME`/`PASSWORD`/`AZURE_DEVOPS_PAT`
  live only in `.env` (gitignored).

## Environment

- Config lives in `.env` (copy from `.env.example`).
- **Core:** `ANDROID_APP_ID`, `IOS_APP_ID`, `ANDROID_APP_NAME`, `IOS_APP_NAME`, `PLATFORM`,
  `USERNAME`, `PASSWORD`, `APP_SOURCE_DIR` (local app checkout for selector discovery).
- **Azure (optional):** `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PROJECT`,
  `AZURE_TEST_PLAN_ID`, `AZURE_TEST_SUITE_ID` (`PLAN_ID` / `SUITE_ID` legacy aliases).
  Omit the whole block if you do not publish to Test Plans.

## Running tests

```bash
npm run setup                                              # bootstrap (env + deps + Maestro + doctor)
npm run check                                              # headless CI gate (test + validate + gherkin-extract)
npm run validate                                           # static check, no device needed
npm run doctor                                             # preflight: deps, Maestro, devices (soft), PAT
npm run doctor:device                                      # agent gate: fail if no device connected
npm run feature -- --feature maestro/features/<Area>.feature --platform android --no-publish
npm run flow:android -- --flow maestro/flows/OpenApp.yml   # direct flow, no runner
npm run gherkin-report                                     # Gherkin dictionary UI
```

`NO_PUBLISH`: pass `--no-publish` to the runner to keep results off Azure.

## Guardrails

- After editing features, step-definitions, or flows, run **`npm run check`** (preferred CI gate).
- If you only touched Gherkin or step-def patterns, at minimum run `npm run validate` and
  `npm run gherkin-extract` (both are included in `npm run check`).
