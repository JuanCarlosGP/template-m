# e2e-specs — automation planning specs

Structured markdown specs for the **Izertis Maestro Template**. **Not** [OpenSpec](https://openspec.dev/) — planning artifacts for the agent pipeline.

Each spec is the **source of truth for one issue / HU**: acceptance criteria, environment recon, Gherkin, automation plan, sanity traceability, and final outcome.

## Layout

```
e2e-specs/
└── specs/
    └── <id>.md     # Issue #, work item ID, or manual slug
```

## Workflow

Full pipeline: [`docs/agent/workflow.md`](../docs/agent/workflow.md).

1. **environment-scout** — Maestro MCP recon on live device
2. **test-planner** — writes `e2e-specs/specs/<id>.md` from issue + scout report
3. **User confirms** the plan
4. **author-e2e-test** — builds `maestro/**`, runs until green
5. **sanity-reviewer** — maps test back to HU criteria; fills **Sanity (post-ejecución)**
6. **Gate / Resultado** updated; optional **committing**

Entry: [`docs/agent/author-e2e-test/SKILL.md`](../docs/agent/author-e2e-test/SKILL.md).

## Spec sections

| Section | Who fills it |
|---------|----------------|
| Objetivo, Criterios de aceptación | test-planner |
| Reconocimiento del entorno | environment-scout → test-planner |
| Escenarios (Gherkin) | test-planner |
| Plan de automatización, Selectores, Decisiones | test-planner |
| Sanity (post-ejecución) | sanity-reviewer (after green run) |
| Gate / Resultado | author-e2e-test |

See specs under `specs/` once you add scenarios. Content in **Spanish**; use `(ninguno)` for empty sections.
