# MCP setup (Maestro + optional TMS)

Copy-paste blocks for [`.mcp.json`](../../.mcp.json). **Not used by `npm run check` or CI** — only for AI-assisted authoring in your IDE.

The template ships **only `maestro`** in `.mcp.json` so the project opens without TMS auth errors. JSON has no comments — use this doc to decide what to add.

Related: [agent playbooks](README.md) · [`e2e-specs/`](../../e2e-specs/README.md)

---

## By workflow

| Workflow | MCP in `.mcp.json` | Section below |
|----------|-------------------|---------------|
| CI / static validation (`npm run check`) | None extra | — |
| **Issue → test (full pipeline)** | `maestro` + optional TMS | [`workflow.md`](workflow.md) |
| Plan automation from a ticket | **One** TMS + `maestro` | [TMS blocks](#rule-one-tms-at-a-time) |
| Explore selectors on device | `maestro` (already included) | [`maestro`](#maestro-live-device) |
| Author or debug flows live | `maestro` + TMS optional | both |
| Paste Gherkin into the agent only | `maestro` enough (or no MCP) | — |

## Quick rules

1. **Keep `maestro`** when inspecting the screen or running flows from the agent.
2. **Add one TMS** if tickets live in Azure DevOps, GitHub, or GitLab — copy a block from [Full examples](#full-mcpjson-examples) or per-server sections below.
3. **Never enable multiple TMS blocks** — the IDE connects to all of them; unused ones fail or waste context.
4. **Windows:** point `maestro` `command` at `${USERPROFILE}\\.maestro\\bin\\maestro.bat` if needed.

## TMS → block and auth

| Tickets live in… | Block | Auth |
|------------------|-------|------|
| Azure DevOps + Test Cases | `azure-devops` | Interactive browser login in the IDE |
| GitHub Issues | `github` | `GITHUB_TOKEN` in your environment ([`.env.example`](../../.env.example)) |
| GitLab Issues | `gitlab` | OAuth on first connect (Premium/Ultimate) |

**No TMS MCP?** Paste Gherkin into the agent or use `gh` / `glab` CLI. Planning (`test-planner` → `e2e-specs/specs/`) works without any TMS MCP.

---

## Rule: one TMS at a time

Keep **`maestro`** for live-device work. For tickets and Gherkin, enable **exactly one** of:

| TMS block | When |
|-----------|------|
| `azure-devops` | Work items and linked Test Cases in Azure DevOps |
| `github` | Issues / PRs on GitHub.com or GitHub Enterprise |
| `gitlab` | Issues / MRs on GitLab.com or self-managed |

Cursor loads every server in `.mcp.json` at startup — unused or misconfigured servers cause noise and slow context.

---

## `maestro` (live device)

Already in `.mcp.json`. Required only for `selector-explorer` and live debugging in `author-e2e-test`.

**Windows native** — point `command` at your install, e.g. `${USERPROFILE}\\.maestro\\bin\\maestro.bat` ([Maestro install](https://docs.maestro.dev/getting-started/installing-maestro)).

---

## `azure-devops`

Replace `your-org` with your Azure DevOps organization.

```json
"azure-devops": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@azure-devops/mcp", "your-org", "--authentication", "interactive"]
}
```

- **Auth:** interactive browser login in the IDE — separate from `AZURE_DEVOPS_PAT` in `.env` (that PAT is for `publish-results.js` when publishing test runs).
- **Playbooks:** `test-planner` / `author-e2e-test` read work items → linked Test Case → `Microsoft.VSTS.TCM.Steps`.

---

## `github`

Official server: [github/github-mcp-server](https://github.com/github/github-mcp-server). The legacy npm `@modelcontextprotocol/server-github` is **deprecated** — do not use it.

### Option A — Remote HTTP (recommended)

Requires Cursor with HTTP MCP support. Create a [fine-grained or classic PAT](https://github.com/settings/tokens) with `repo` (and `read:org` if needed). Store it in your environment as `GITHUB_TOKEN` — **never commit tokens**.

```json
"github": {
  "type": "http",
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": {
    "Authorization": "Bearer ${env:GITHUB_TOKEN}"
  }
}
```

### Option B — Local Docker

Requires Docker. Same PAT via `GITHUB_PERSONAL_ACCESS_TOKEN`.

```json
"github": {
  "type": "stdio",
  "command": "docker",
  "args": [
    "run",
    "-i",
    "--rm",
    "-e",
    "GITHUB_PERSONAL_ACCESS_TOKEN",
    "ghcr.io/github/github-mcp-server"
  ],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}"
  }
}
```

**Playbooks:** read the Issue by number; Gherkin usually lives in the issue body. Record the issue URL in `e2e-specs/specs/<id>.md`.

---

## `gitlab`

Official server: [GitLab MCP docs](https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/). **Premium or Ultimate** (beta). OAuth on first connect — no PAT in the repo.

Replace `gitlab.com` with your instance hostname on self-managed.

### HTTP (recommended for Cursor)

```json
"gitlab": {
  "type": "http",
  "url": "https://gitlab.com/api/v4/mcp"
}
```

On first use, Cursor opens a browser for OAuth approval.

### stdio via `mcp-remote` (alternative)

Requires Node.js 20+.

```json
"gitlab": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "mcp-remote", "https://gitlab.com/api/v4/mcp"]
}
```

**Playbooks:** read the Issue; Gherkin in description or a linked note. Record the issue URL in the spec header.

---

## Full `.mcp.json` examples

Each example includes `maestro` plus one TMS. Start from the [template `.mcp.json`](../../.mcp.json) (maestro only) and merge the TMS block you need.

### Azure DevOps team

```json
{
  "mcpServers": {
    "maestro": {
      "type": "stdio",
      "command": "${HOME}/.maestro/bin/maestro",
      "args": ["mcp", "--no-viewer"]
    },
    "azure-devops": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "your-org", "--authentication", "interactive"]
    }
  }
}
```

### GitHub Issues team

```json
{
  "mcpServers": {
    "maestro": {
      "type": "stdio",
      "command": "${HOME}/.maestro/bin/maestro",
      "args": ["mcp", "--no-viewer"]
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${env:GITHUB_TOKEN}"
      }
    }
  }
}
```

### GitLab Issues team

```json
{
  "mcpServers": {
    "maestro": {
      "type": "stdio",
      "command": "${HOME}/.maestro/bin/maestro",
      "args": ["mcp", "--no-viewer"]
    },
    "gitlab": {
      "type": "http",
      "url": "https://gitlab.com/api/v4/mcp"
    }
  }
}
```

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| MCP server red / failing at startup | Remove TMS blocks you do not use; fix `your-org` / tokens / Docker |
| Azure MCP works but publish fails | `AZURE_DEVOPS_PAT` in `.env` is unrelated to Azure MCP browser login |
| GitHub 401 | `GITHUB_TOKEN` in shell env; PAT scopes include repo read |
| GitLab OAuth never opens | Restart IDE; confirm Premium/Ultimate + beta features on the group/instance |
| Maestro MCP not found on Windows | Use `maestro.bat` path — see [README § MCP](README.md#mcp-mcpjson) |
