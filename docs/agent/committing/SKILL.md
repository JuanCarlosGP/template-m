---
name: committing
description: Branch, commit, push, and open a DRAFT pull request for review. Use when the user wants to commit/ship work in this repo, says "commit this", "open a PR", or when author-e2e-test or debug-flow reaches the commit step. Prefer this playbook over generic commit instructions for the Izertis Maestro Template repo.
---

# Committing (draft PR)

This repo is the **Izertis Maestro Template**. Adjust org, project, and repository name to match your fork (Azure DevOps, GitHub, etc.).
The flow ends in a **draft PR** the user reviews and publishes manually. Never publish the
PR yourself.

## Phase 1 — Stage & review

1. `git status` and `git diff` to see what changed. Confirm `npm run validate`
   passes if features/step-defs/flows were touched.
2. For **new issue-driven tests**, confirm `e2e-specs/specs/<id>.md` has **Sanity (post-ejecución)** OK (or user accepted gaps) per [`workflow.md`](../workflow.md).
3. **Never stage secrets** — no real `USERNAME`/`PASSWORD`/`AZURE_DEVOPS_PAT` in tracked
   files (the pre-write hook guards this if configured; double-check `.env` is not staged).
3. Identify the **ticket ID** in play (from the user, the branch, or the originating
   author-e2e-test / debug-flow run).

## Phase 2 — Branch

Follow the repo convention `<type>/<ticketId>_<slug>` with a **Spanish snake_case slug**
derived from the ticket title (e.g. `feat/12345_login_demo`,
`fix/12345_login_timeout`). Types: `feat` (new test), `fix` (flow fix), `chore`
(framework/tooling).

```bash
git switch -c <type>/<id>_<slug>    # if not already on a suitable branch; else reuse it
```

If already on a feature branch for this work, reuse it instead of creating a new one. Never
commit directly to `master`.

## Phase 3 — Commit

Propose a **conventional commit** message referencing the ticket, get a quick
confirmation, then commit:

```
[<id>] <type>: <imperative summary in Spanish or English, matching repo tone>

<short why, if not obvious>
```

```bash
git add <paths>      # explicit paths, never `git add .` blindly
git commit -m "..."
git push -u origin <branch>
```

## Phase 4 — Open the DRAFT PR

**Azure DevOps:** prefer the **`azure-devops` MCP** or REST API with `AZURE_DEVOPS_PAT`
(same auth as `maestro/scripts/publish-results.js`).

**GitHub:** use `gh pr create --draft`.

- source = your branch, target = default branch
- **`isDraft: true`** / `--draft`
- link the ticket
- title mirrors the commit summary; description includes what changed, platforms verified
  (iOS/Android), and any unverified selectors or dropped cases.

## Phase 5 — Hand back

Report the PR URL and that it is in **draft**. The user reviews and publishes it manually.
