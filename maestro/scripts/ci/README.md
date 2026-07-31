# CI helpers

Scripts used by GitHub Actions (Android emulator job) and optional failure triage.

| File | Role |
|------|------|
| `run-android-emulator-e2e.sh` | Entry for `android-emulator-runner`: features → screenshots → summary → triage on fail |
| `write-summary.js` | Job Summary table from `reports/summary.json` |
| `triage-failure.js` | Report-only agent triage (+ optional Maestro MCP) |
| `agent-providers.js` | Pluggable `AGENT_PROVIDER` adapters (e.g. Cursor SDK) |

Shared reporting helpers stay in `maestro/scripts/lib/` (e.g. `playwright-report.js`).
