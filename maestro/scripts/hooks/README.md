# Maestro E2E hooks (optional)

Node scripts for **IDE integration** (post-edit validation, credential guard). Not used by `npm run check` or CI.

| Script | When | Effect |
|--------|------|--------|
| [`block-secrets.js`](block-secrets.js) | Before Edit/Write | Blocks real credentials in tracked files |
| [`validate-edit.js`](validate-edit.js) | After Edit/Write on features/step-defs/flows | Runs static validate |
| [`env-readiness.js`](env-readiness.js) | Session start | Prints device/env summary |

## Wire-up (local, per developer)

Each IDE uses different config for post-edit hooks. Example (replace `$REPO` with your project root):

```bash
node "$REPO/maestro/scripts/hooks/block-secrets.js"
node "$REPO/maestro/scripts/hooks/validate-edit.js"
node "$REPO/maestro/scripts/hooks/env-readiness.js"
```

See also: [`docs/agent/`](../../../docs/agent/README.md), [`AGENTS.md`](../../../AGENTS.md).
