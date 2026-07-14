# Agent playbooks (optional)

Neutral markdown playbooks for **AI-assisted E2E authoring**. Not required to run tests — the official contract is **npm** (`npm run check`, `npm run feature`, …).

## End-to-end workflow (issue → green → sanity)

**Start here:** [`workflow.md`](workflow.md) · entry playbook [`author-e2e-test/SKILL.md`](author-e2e-test/SKILL.md)

```
issue/HU → environment-scout → test-planner → [confirm] → author → sanity-reviewer → commit?
```

## Contents

| Path | Phase | Purpose |
|------|-------|---------|
| [`workflow.md`](workflow.md) | — | Full pipeline orchestration |
| [`author-e2e-test/`](author-e2e-test/SKILL.md) | All | **Entry point** — runs the pipeline |
| [`agents/environment-scout.md`](agents/environment-scout.md) | 1 | Live app recon via Maestro MCP |
| [`agents/test-planner.md`](agents/test-planner.md) | 2 | Writes `e2e-specs/specs/<id>.md` |
| [`agents/selector-explorer.md`](agents/selector-explorer.md) | 4 | Selectors on device + source |
| [`agents/sanity-reviewer.md`](agents/sanity-reviewer.md) | 6 | Post-green HU traceability |
| [`debug-flow/`](debug-flow/SKILL.md) | — | Fix failing tests (not new authoring) |
| [`run-tests-e2e/`](run-tests-e2e/SKILL.md) | — | Headless smoke / device runs |
| [`committing/`](committing/SKILL.md) | 8 | Draft PR |

Related:

- [`e2e-specs/`](../../e2e-specs/README.md) — planning specs per ticket
- [`.mcp.json`](../../.mcp.json) — **`maestro` only** by default — see [MCP setup](#mcp-mcpjson)
- [`mcp-examples.md`](mcp-examples.md) — TMS blocks (Azure, GitHub, GitLab)
- [`docs/README.md`](../README.md) — CI, DEVICE, index
- [`AGENTS.md`](../../AGENTS.md) — project rules

## MCP (`.mcp.json`)

Optional. **Not used by `npm run check` or CI**.

| Server | Workflow step | Required? |
|--------|---------------|-----------|
| **`maestro`** | environment-scout, selector-explorer, debug | **Yes** for live authoring |
| **`azure-devops`** / **`github`** / **`gitlab`** | Fetch issue / Gherkin | One TMS optional — [`mcp-examples.md`](mcp-examples.md) |

Ships **only `maestro`** so the IDE opens cleanly. Add one TMS block when automating from tickets.

### Personalize after fork

1. **`maestro`** — `${HOME}/.maestro/bin/maestro` (Unix); Windows: `${USERPROFILE}\\.maestro\\bin\\maestro.bat`
2. **TMS** — [`mcp-examples.md`](mcp-examples.md)
3. **No TMS** — paste issue + Gherkin; scout + planner still work

## Use with your IDE

Point your agent at [`author-e2e-test/SKILL.md`](author-e2e-test/SKILL.md) with an issue ID, or at individual agents for a single step.

Optional hooks: [`maestro/scripts/hooks/`](../../maestro/scripts/hooks/README.md).
