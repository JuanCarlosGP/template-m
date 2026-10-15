#!/usr/bin/env tsx
import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// PostToolUse hook. When an agent edits a .feature, step-definitions/*.json, or Maestro
// flow .yml, run the static validator. On failure, exit 2 so the error is fed back.
// Non-relevant edits and a clean validation exit 0 silently.

let raw = ''
process.stdin.on('data', c => { raw += c })
process.stdin.on('end', () => {
  let filePath = ''
  try {
    filePath = (JSON.parse(raw).tool_input || {}).file_path || ''
  } catch {
    process.exit(0)
  }

  const relevant =
    /\.feature$/.test(filePath) ||
    /step-definitions\/.*\.json$/.test(filePath) ||
    /maestro\/(flows|shared|ios|android)\/.*\.yml$/.test(filePath)

  if (!relevant) process.exit(0)

  const validator = path.join(__dirname, '..', 'validate.ts')
  try {
    execFileSync(process.execPath, ['--import', 'tsx', validator], { stdio: 'pipe' })
    process.exit(0)
  } catch (err) {
    const out = (err.stdout || '').toString() + (err.stderr || '').toString()
    process.stderr.write(`Static validation failed after editing ${path.basename(filePath)}:\n${out}`)
    process.exit(2)
  }
})
