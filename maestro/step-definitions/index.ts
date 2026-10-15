import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const repoRoot = path.join(__dirname, '..', '..')

const allSteps = fs
  .readdirSync(__dirname)
  .filter(f => f.endsWith('.json') && f !== 'schema.json')
  .sort()
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')).steps.map(entry => ({
    ...entry,
    definitionFile: f,
    _regex: entry.params ? new RegExp(entry.pattern) : null,
  })))
  .sort((a, b) => b.pattern.length - a.pattern.length)

function matchStep(stepText, entry) {
  const extractedParams = {} as any

  if (entry._regex) {
    const m = stepText.match(entry._regex)
    if (!m) return null
    entry.params.forEach((name, i) => { extractedParams[name] = m[i + 1] })
    return extractedParams
  }

  if (stepText.includes(entry.pattern)) return extractedParams
  return null
}

function normalizeFlowId(flowName) {
  return String(flowName).replace(/\\/g, '/').replace(/\.yml$/i, '')
}

function sharedFlowAbs(flowId) {
  const parts = flowId.split('/').filter(Boolean)
  const file = `${parts.pop()}.yml`
  return path.join(repoRoot, 'maestro', 'shared', ...parts, file)
}

function resolveMaestroFlowFile(flowName) {
  if (!flowName) return null
  const flowId = normalizeFlowId(flowName)
  const candidates = [sharedFlowAbs(flowId)]
  if (!flowId.includes('/')) {
    const sharedRoot = path.join(repoRoot, 'maestro', 'shared')
    if (fs.existsSync(sharedRoot)) {
      for (const entry of fs.readdirSync(sharedRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.push(path.join(sharedRoot, entry.name, `${flowId}.yml`))
      }
    }
  }
  const seen = new Set()
  for (const c of candidates) {
    const abs = path.resolve(c)
    if (seen.has(abs)) continue
    seen.add(abs)
    if (fs.existsSync(abs)) return abs
  }
  return null
}

function resolveMaestroFlowPath(flowName) {
  const abs = resolveMaestroFlowFile(flowName)
  if (!abs) return null
  return path.relative(repoRoot, abs).replace(/\\/g, '/')
}

function buildMatchResult(entry, extractedParams) {
  return {
    pattern: entry.pattern,
    flow: entry.flow,
    params: extractedParams,
    paramNames: entry.params || [],
    description: entry.description || null,
    definitionFile: entry.definitionFile,
    executesFlow: entry.flow != null,
    maestroFlowPath: resolveMaestroFlowPath(entry.flow),
  }
}

function tryResolveStep(stepText) {
  const matches = resolveAllMatches(stepText)
  return matches.length > 0 ? matches[0] : null
}

function resolveAllMatches(stepText) {
  const matches = []
  for (const entry of allSteps) {
    const extractedParams = matchStep(stepText, entry)
    if (extractedParams !== null) matches.push(buildMatchResult(entry, extractedParams))
  }
  return matches
}

function resolveStep(stepText) {
  const result = tryResolveStep(stepText)
  if (!result) throw new Error(`No step definition found for: "${stepText}"`)
  return { flow: result.flow, params: result.params }
}

function resolveStepSafe(stepText) {
  return tryResolveStep(stepText)
}

function getAllDefinitions() {
  return allSteps.map(entry => ({
    pattern: entry.pattern,
    flow: entry.flow,
    paramNames: entry.params || [],
    description: entry.description || null,
    definitionFile: entry.definitionFile,
    executesFlow: entry.flow != null,
    maestroFlowPath: resolveMaestroFlowPath(entry.flow),
  }))
}

export { resolveStep, resolveStepSafe, resolveAllMatches, getAllDefinitions, resolveMaestroFlowFile, resolveMaestroFlowPath }
