import fs from 'fs'
import path from 'path'
import { compositeFlowResults } from './compose-flows.js'

/**
 * Maestro's commands JSON lists every runFlow, including nested helpers.
 * Only the composer's own `file:` paths identify a Gherkin step. The first
 * FAILED among those is the failing step; earlier COMPLETED ones passed;
 * later ones (missing or SKIPPED) were interrupted.
 * Returns null when the log cannot support that picture.
 */
function attributeCompositeFlows(flows, commands) {
  if (!Array.isArray(flows) || !flows.length) return null
  if (!Array.isArray(commands) || !commands.length) return null
  if (flows.some(f => !f || !f.fileRel)) return null

  const wanted = new Set(flows.map(f => f.fileRel))
  const events = []
  for (const entry of commands) {
    const src = entry && entry.command && entry.command.runFlowCommand
      && entry.command.runFlowCommand.sourceDescription
    const meta = entry && entry.metadata
    if (!src || !wanted.has(src) || !meta || !meta.status) continue
    events.push({
      src,
      status: meta.status,
      duration: meta.duration,
      seq: typeof meta.sequenceNumber === 'number' ? meta.sequenceNumber : 0,
      error: meta.error && meta.error.message ? String(meta.error.message) : null,
    })
  }
  events.sort((a, b) => a.seq - b.seq)
  if (!events.length) return null

  let cursor = 0
  const assigned = flows.map(flow => {
    for (let i = cursor; i < events.length; i++) {
      if (events[i].src !== flow.fileRel) continue
      cursor = i + 1
      return events[i]
    }
    return null
  })

  const failIdx = assigned.findIndex(ev => ev && ev.status === 'FAILED')
  if (failIdx === -1) {
    if (assigned.some(ev => !ev || ev.status !== 'COMPLETED')) return null
    return assigned.map((ev, i) => row(flows[i], 'passed', ev.duration, null))
  }

  for (let i = 0; i < failIdx; i++) {
    if (!assigned[i] || assigned[i].status !== 'COMPLETED') return null
  }
  if (!assigned[failIdx] || assigned[failIdx].status !== 'FAILED') return null

  return flows.map((flow, i) => {
    if (i < failIdx) return row(flow, 'passed', assigned[i].duration, null)
    if (i === failIdx) return row(flow, 'failed', assigned[failIdx].duration, assigned[failIdx].error)
    return row(flow, 'interrupted', 0, null)
  })
}

function row(flow, status, duration, error) {
  return {
    flow: flow.flow,
    title: flow.flow,
    params: flow.params || {},
    status,
    durationMs: typeof duration === 'number' ? duration : null,
    error: error || null,
  }
}

function findComposerCommandFile(artifactDir, { name, sinceMs } = {} as any) {
  if (!artifactDir || !name || !fs.existsSync(artifactDir)) return null
  const needle = `commands-(${name}).json`
  const floor = typeof sinceMs === 'number' ? sinceMs - 2000 : null
  let best = null

  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name !== needle) continue
      let st
      try {
        st = fs.statSync(full)
      } catch {
        continue
      }
      if (floor != null && st.mtimeMs < floor) continue
      if (!best || st.mtimeMs > best.mtimeMs) best = { full, mtimeMs: st.mtimeMs }
    }
  }

  walk(artifactDir)
  return best ? best.full : null
}

function findComposerCommandLog(artifactDir, opts = {} as any) {
  const file = findComposerCommandFile(artifactDir, opts)
  if (!file) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function findComposerDebugDir(artifactDir, opts = {} as any) {
  const file = findComposerCommandFile(artifactDir, opts)
  return file ? path.dirname(file) : null
}

/**
 * Prefer the Maestro command log. If it cannot say which runFlow failed,
 * keep the honest fallback: green without a duration, or "sin dato".
 */
function resolveCompositeFlowResults(flows, commands, { passed }) {
  const attributed = attributeCompositeFlows(flows, commands)
  if (!attributed) return compositeFlowResults(flows, { passed })
  const sawFailure = attributed.some(r => r.status === 'failed')
  if (passed && sawFailure) return compositeFlowResults(flows, { passed: true })
  if (!passed && !sawFailure) return compositeFlowResults(flows, { passed: false })
  return attributed
}

export { attributeCompositeFlows, findComposerCommandLog, findComposerDebugDir, resolveCompositeFlowResults }
