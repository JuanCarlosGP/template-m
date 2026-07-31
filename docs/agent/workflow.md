# E2E agent workflow — issue to green

Orchestration for the **Izertis Maestro Template**. The official test contract remains **npm** (`npm run check`, `npm run feature`, …). This document describes how agents should run the **authoring pipeline** from a ticket.

Harness prose is English; **specs, Gherkin, and branch slugs stay in Spanish**.

## When to use this

- User gives an **issue / HU / work item ID** and wants E2E automation.
- User says "automate issue #123", "author test for `<id>`", or similar.

For **fixing** an existing failing test, use [`debug-flow/SKILL.md`](debug-flow/SKILL.md) instead.

## Prerequisites

| Requirement | Why |
|-------------|-----|
| **`npm run doctor:device` green** | Gate: ≥1 Android/iOS device before scout and before author |
| Booted simulator/emulator + app installed | `environment-scout`, `selector-explorer`, device runs |
| **`maestro` MCP** in [`.mcp.json`](../../.mcp.json) | Live hierarchy, screenshots, exploratory taps |
| **One TMS MCP** (optional) | Fetch issue body / Gherkin — see [`mcp-examples.md`](mcp-examples.md) |
| `.env` with `ANDROID_APP_ID` / `IOS_APP_ID` | Runner and flows |
| `APP_SOURCE_DIR` (recommended) | Selector discovery from app source |

Device setup: [`docs/DEVICE.md`](../DEVICE.md).

## Pipeline

```
┌─────────────┐
│ Issue / HU  │
└──────┬──────┘
       ▼
┌─────────────────────┐     npm run doctor:device — STOP if Devices empty
│ 0. device gate      │
└──────┬──────────────┘
       ▼
┌─────────────────────┐     Maestro MCP: list_devices, inspect_screen,
│ 1. environment-scout │     launch app, navigate toward HU screens
└──────┬──────────────┘     (hard blocker ⇒ no planner)
       ▼
┌─────────────────────┐     TMS MCP + suite + APP_SOURCE_DIR + scout report
│ 2. test-planner      │ ──► e2e-specs/specs/<id>.md
└──────┬──────────────┘
       ▼
┌─────────────────────┐
│ 3. User confirms    │     Quick OK on plan / Gherkin / drop-MSW decisions
└──────┬──────────────┘
       ▼
┌─────────────────────┐     npm run doctor:device again — STOP if no device
│ 4. author (build)   │     feature, step-defs, flows (selector-explorer)
└──────┬──────────────┘     npm run validate after edits
       ▼
┌─────────────────────┐     npm run feature / flow:* — bounded retries
│ 5. execute          │
└──────┬──────────────┘
       ▼
┌─────────────────────┐     Map assertions → HU acceptance criteria
│ 6. sanity-reviewer  │
└──────┬──────────────┘
       ▼
┌─────────────────────┐     Gate/Resultado + Sanity in spec
│ 7. Close spec       │
└──────┬──────────────┘
       ▼
┌─────────────────────┐     Optional
│ 8. committing       │     Draft PR linked to issue
└─────────────────────┘
```

## Agents and playbooks

| Step | Agent / playbook | Writes files? | Runs device? |
|------|------------------|---------------|--------------|
| 1 | [`agents/environment-scout.md`](agents/environment-scout.md) | No | Yes (MCP) |
| 2 | [`agents/test-planner.md`](agents/test-planner.md) | `e2e-specs/specs/<id>.md` | No |
| 4–5 | [`author-e2e-test/SKILL.md`](author-e2e-test/SKILL.md) | `maestro/**` | Yes |
| — | [`agents/selector-explorer.md`](agents/selector-explorer.md) | No | Yes (MCP) |
| 6 | [`agents/sanity-reviewer.md`](agents/sanity-reviewer.md) | Updates spec only | No |
| 8 | [`committing/SKILL.md`](committing/SKILL.md) | git | No |

Supporting: [`run-tests-e2e/SKILL.md`](run-tests-e2e/SKILL.md) (headless smoke), [`debug-flow/SKILL.md`](debug-flow/SKILL.md) (fixes).

## Issue types

| Input | Planner behaviour |
|-------|-------------------|
| Issue with **Gherkin** in body | Extract verbatim into spec |
| Issue with **acceptance criteria** only | Draft Gherkin scenarios from criteria; mark as *propuesto* in spec |
| Azure **work item + linked Test Case** | Gherkin from `Microsoft.VSTS.TCM.Steps` |
| User **pastes** Gherkin | Use as-is; note source as `manual` |

## Bounded execution (steps 4–5)

Shared limits — do not loop forever:

- **Max 3 device attempts per platform**
- **Stop on two consecutive identical failures**
- Escalate: drop automation, or MSW dev build (`environment=mock`)

## Outputs

| Artifact | Location |
|----------|----------|
| Test plan | `e2e-specs/specs/<id>.md` |
| Executable test | `maestro/features/`, `step-definitions/<area|common>.json`, `flows/` |
| Run results | `reports/summary.json`, `reports/junit.xml` |
| Draft PR | via `committing` (optional) |

## Entry commands (human)

```bash
npm run doctor          # preflight (device soft-warn)
npm run doctor:device   # agent gate: fail if Devices empty
npm run validate        # after authoring edits
npm run feature -- --feature maestro/features/<Area>.feature --platform all --no-publish
```

Point your IDE agent at [`author-e2e-test/SKILL.md`](author-e2e-test/SKILL.md) with the issue ID to run the full pipeline.
