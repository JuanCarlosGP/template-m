# Documentation — Izertis Maestro Template

Harness prose is **English** in this folder; **Gherkin and e2e-specs content stay in Spanish**.

## Contents

| Doc | Audience | Purpose |
|-----|----------|---------|
| [`guia-framework-maestro.html`](guia-framework-maestro.html) | Humans | Visual onboarding guide (open in any browser) |
| [`CI.md`](CI.md) | Humans / DevOps | Headless gate, device jobs, reports, example pipelines |
| [`DEVICE.md`](DEVICE.md) | Humans | Emulators, installs, Maestro CLI — local device work |
| [`agent/README.md`](agent/README.md) | AI agents | Playbooks, MCP setup, **end-to-end workflow** |
| [`agent/workflow.md`](agent/workflow.md) | AI agents | Orchestration: issue → plan → author → green → sanity |
| [`agent/mcp-examples.md`](agent/mcp-examples.md) | Humans / agents | `.mcp.json` blocks (Maestro + optional TMS) |

## Agent flow (issue → green → sanity)

For automating from a **GitHub/GitLab/Azure issue or HU**:

```
issue/HU
  → environment-scout (Maestro MCP: device + pantallas)
  → test-planner (issue + recon → e2e-specs/specs/<id>.md)
  → [confirmación usuario]
  → author-e2e-test (feature + flows + ejecución acotada)
  → sanity-reviewer (¿el test verifica la HU?)
  → actualizar spec + committing (opcional)
```

Entry point: [`agent/author-e2e-test/SKILL.md`](agent/author-e2e-test/SKILL.md) or [`agent/workflow.md`](agent/workflow.md).

Related: [`e2e-specs/`](../e2e-specs/README.md) · [`AGENTS.md`](../AGENTS.md) · [`.mcp.json`](../.mcp.json)
