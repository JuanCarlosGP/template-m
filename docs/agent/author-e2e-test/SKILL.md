---
name: author-e2e-test
description: End-to-end E2E authoring from an issue/HU — environment scout, test plan, build flows, run until green, sanity review. Orchestrates environment-scout, test-planner, selector-explorer, sanity-reviewer, and committing. Use for "automate issue <id>", "author test for <id>", or new E2E from a ticket.
---

# Authoring an E2E test from an issue / HU

Full pipeline: [`docs/agent/workflow.md`](../workflow.md).

Input: **issue / HU / work item ID** (GitHub, GitLab, Azure DevOps, or manual slug).

Harness prose is English; **generated Gherkin, specs, and branch slugs stay in Spanish**.

## Phase −1 — Device gate (mandatory)

**Before** environment-scout and **again before** authoring (Phase 2) after the user confirms the plan:

```bash
npm run doctor:device
```

This is `doctor --require-device`: the **Devices** section must show at least one connected Android `device` or booted iOS simulator. Exit code **0** = proceed; **non-zero** = **STOP**.

If it fails:

1. Tell the user there is **no device** — do not invent screens or selectors.
2. **Do not** run environment-scout, test-planner, or write `e2e-specs` / `maestro/**`.
3. Ask them to connect a device (`adb devices -l` / wireless debugging / emulator) and re-run `/author-e2e-test`.

No device ⇒ no scout ⇒ no plan ⇒ no author. Partial scout because the device dropped mid-run is also a **hard stop** before planning or authoring.

## Phase 0 — Environment reconnaissance

**Only after** `npm run doctor:device` succeeds.

Launch **environment-scout** ([`agents/environment-scout.md`](../agents/environment-scout.md)) with the issue title and acceptance criteria (or Gherkin hint).

Requires **`maestro` MCP** and a booted device with the app installed ([`docs/DEVICE.md`](../../DEVICE.md)).

If scout reports a **hard blocker** (no device, app won't launch, device goes offline), stop and tell the user — **do not** run test-planner or write flows.

## Phase 1 — Test plan (test-planner → e2e-spec)

**Only after** a successful scout (not skipped, not blocked).

Launch **test-planner** ([`agents/test-planner.md`](../agents/test-planner.md)) with:

- Ticket ID
- Environment scout report
- Any user-pasted Gherkin

It writes `e2e-specs/specs/<id>.md`. **Show the plan to the user and get quick confirmation** before building.

The spec is the **source of truth** for phases 2–6. Read Gherkin and acceptance criteria from the spec — do not re-fetch the issue unless the spec is incomplete.

## Phase 2 — Map to the suite structure

**Re-run** `npm run doctor:device`. If it fails, stop — do not author features/flows until a device is back.

From the spec's **Plan de automatización**:

1. Create or extend `maestro/features/<Area>.feature` with the Gherkin scenarios.
2. For each step, match `step-definitions/*.json` (**longest pattern wins**).
   - **Reuse** an existing pattern when it already fits — do not duplicate.
   - **New step for an existing area** → add it to that area's JSON (e.g. `auth.json`).
   - **New feature area** → create `step-definitions/<area>.json`; do not dump everything into one file.
   - **Shared** navigation/assertions (`OpenApp`, `AssertVisibleText`, …) → `common.json`.
   - Prefer one Gherkin step when a flow already does several UI actions (e.g. `abro el menú y pulso "X"` → open drawer + tap). Use `"flow": null` only for true documentary preconditions, not to duplicate that work.
3. Parameterised steps: regex `pattern` + `params` → `--env` vars.

Run `npm run validate` after edits.

## Phase 3 — Build flows (both platforms)

For every **new** flow:

1. Launch **selector-explorer** ([`agents/selector-explorer.md`](../agents/selector-explorer.md)) for real selectors — **iOS and Android** — using scout + spec hints.
2. Create `flows/`, `shared/`, `ios/`, `android/` YAML per suite conventions (`appId: ${APP_ID}`, platform branch when needed).
3. Reuse existing flows (`Login`, `AcceptPermissions`, etc.) where the spec says so.

Run `npm run validate` before device.

## Phase 4 — Execute on device (bounded)

```bash
npm run feature -- --feature maestro/features/<Area>.feature --platform all --no-publish
```

Debug with **`maestro` MCP** between attempts. Limits:

- **Max 3 attempts per platform**
- **Stop on two consecutive identical failures**

On trip: escalate — **drop**, **MSW** (`environment=mock`), or hand back with evidence.

If red after bounded loop, update spec **Gate / Resultado** (Descartado / Requiere MSW) and stop before sanity.

## Phase 5 — Sanity review (post-green)

Only when **green on both platforms** (or the spec's declared platform scope).

Launch **sanity-reviewer** ([`agents/sanity-reviewer.md`](../agents/sanity-reviewer.md)) with the spec, issue criteria, and `reports/summary.json`.

| Verdict | Action |
|---------|--------|
| **OK** | Proceed to Phase 6 |
| **Gap** | Fix flows/assertions, re-run Phase 4 (bounded), re-run sanity |
| **Mismatch** | Stop — replan with test-planner or mark Descartado |

## Phase 6 — Close spec

1. Update **Gate / Resultado** in `e2e-specs/specs/<id>.md`.
2. Ensure **Sanity (post-ejecución)** is filled by sanity-reviewer.

## Phase 7 — Commit (optional)

When sanity is **OK** (or user accepts documented gaps):

Invoke **committing** ([`committing/SKILL.md`](../committing/SKILL.md)) — branch, commit, draft PR linked to the issue.

If dropped or MSW-only, still update the spec and optionally commit the decision for review.
