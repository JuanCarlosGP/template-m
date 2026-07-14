const fs = require('fs')
const path = require('path')

const repoRoot = path.join(__dirname, '..', '..')

const allSteps = fs
  .readdirSync(__dirname)
  .filter(f => f.endsWith('.json') && f !== 'schema.json')
  .sort()
  .flatMap(f => require(path.join(__dirname, f)).steps.map(entry => ({
    ...entry,
    definitionFile: f,
    _regex: entry.params ? new RegExp(entry.pattern) : null,
  })))
  .sort((a, b) => b.pattern.length - a.pattern.length)

function matchStep(stepText, entry) {
  const extractedParams = {}

  if (entry._regex) {
    const m = stepText.match(entry._regex)
    if (!m) return null
    entry.params.forEach((name, i) => { extractedParams[name] = m[i + 1] })
    return extractedParams
  }

  if (stepText.includes(entry.pattern)) return extractedParams
  return null
}

function resolveMaestroFlowPath(flowName) {
  if (!flowName) return null
  const flowsPath = path.join(repoRoot, 'maestro', 'flows', `${flowName}.yml`)
  const sharedPath = path.join(repoRoot, 'maestro', 'shared', `${flowName}.yml`)
  if (fs.existsSync(flowsPath)) return path.relative(repoRoot, flowsPath).replace(/\\/g, '/')
  if (fs.existsSync(sharedPath)) return path.relative(repoRoot, sharedPath).replace(/\\/g, '/')
  return null
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

module.exports = { resolveStep, resolveStepSafe, resolveAllMatches, getAllDefinitions }
