# Maestro E2E hooks (optional)

Node scripts for **IDE integration** (post-edit validation, credential guard). Not used by `npm run check` or CI.

| Script | When | Effect |
|--------|------|--------|
| [`block-secrets.ts`](block-secrets.ts) | Before Edit/Write | Blocks real credentials in tracked files |
| [`validate-edit.ts`](validate-edit.ts) | After Edit/Write on features/step-defs/flows | Runs static validate |
| [`env-readiness.ts`](env-readiness.ts) | Session start | Prints device/env summary |

## Wire-up (local, per developer)

Each IDE uses different config for post-edit hooks. Example (replace `$REPO` with your project root):

```bash
node --import tsx "$REPO/maestro/scripts/hooks/block-secrets.ts"
node --import tsx "$REPO/maestro/scripts/hooks/validate-edit.ts"
node --import tsx "$REPO/maestro/scripts/hooks/env-readiness.ts"
```

See also: [`docs/agent/`](../../../docs/agent/README.md), [`AGENTS.md`](../../../AGENTS.md).
