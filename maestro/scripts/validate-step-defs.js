'use strict'

const fs = require('fs')
const path = require('path')

const STEP_DEFS_DIR = path.join(__dirname, '..', 'step-definitions')

function countCaptureGroups(pattern) {
  try {
    const re = new RegExp(pattern)
    const source = re.source
    let count = 0
    let i = 0
    while (i < source.length) {
      if (source[i] === '\\') {
        i += 2
        continue
      }
      if (source[i] === '(' && source[i + 1] !== '?') count++
      i++
    }
    return count
  } catch {
    return -1
  }
}

function validateStepEntry(entry, file, index) {
  const prefix = `${file} › steps[${index}]`
  const problems = []

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    problems.push(`${prefix}: must be an object`)
    return problems
  }

  if (typeof entry.pattern !== 'string' || entry.pattern.length === 0) {
    problems.push(`${prefix}: "pattern" must be a non-empty string`)
  }

  if (!('flow' in entry) || (entry.flow !== null && typeof entry.flow !== 'string')) {
    problems.push(`${prefix}: "flow" must be a string or null`)
  }

  if (entry.params !== undefined) {
    if (!Array.isArray(entry.params) || entry.params.some(p => typeof p !== 'string' || p.length === 0)) {
      problems.push(`${prefix}: "params" must be an array of non-empty strings`)
    }
  }

  if (entry.description !== undefined && typeof entry.description !== 'string') {
    problems.push(`${prefix}: "description" must be a string`)
  }

  const extraKeys = Object.keys(entry).filter(k => !['pattern', 'flow', 'params', 'description'].includes(k))
  if (extraKeys.length) {
    problems.push(`${prefix}: unknown keys: ${extraKeys.join(', ')}`)
  }

  if (typeof entry.pattern === 'string' && entry.pattern.length > 0) {
    const groups = countCaptureGroups(entry.pattern)
    if (groups < 0) {
      problems.push(`${prefix}: invalid regex pattern "${entry.pattern}"`)
    } else if (groups > 0) {
      const params = entry.params || []
      if (params.length !== groups) {
        problems.push(`${prefix}: pattern has ${groups} capture group(s) but params has ${params.length}`)
      }
    } else if (entry.params && entry.params.length > 0) {
      problems.push(`${prefix}: params defined but pattern has no capture groups`)
    }
  }

  return problems
}

function validateStepDefinitionsFile(filePath) {
  const file = path.basename(filePath)
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (err) {
    return [`${file}: invalid JSON — ${err.message}`]
  }

  const problems = []

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return [`${file}: root must be an object with a "steps" array`]
  }

  const extraRoot = Object.keys(doc).filter(k => k !== 'steps')
  if (extraRoot.length) {
    problems.push(`${file}: unknown root keys: ${extraRoot.join(', ')}`)
  }

  if (!Array.isArray(doc.steps) || doc.steps.length === 0) {
    problems.push(`${file}: "steps" must be a non-empty array`)
    return problems
  }

  doc.steps.forEach((entry, index) => {
    problems.push(...validateStepEntry(entry, file, index))
  })

  return problems
}

function validateAllStepDefinitions(options = {}) {
  const { collectOnly = false } = options
  const problems = []

  if (!fs.existsSync(STEP_DEFS_DIR)) {
    const msg = 'step-definitions directory not found'
    if (collectOnly) return [msg]
    console.error(`✗ validate-step-defs: ${msg}`)
    process.exit(1)
  }

  const files = fs.readdirSync(STEP_DEFS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'schema.json')
    .sort()

  if (files.length === 0) {
    problems.push('no step-definition JSON files found')
  }

  for (const file of files) {
    problems.push(...validateStepDefinitionsFile(path.join(STEP_DEFS_DIR, file)))
  }

  if (collectOnly) return problems

  if (problems.length === 0) {
    console.log('✓ validate-step-defs: all step-definition files are valid')
    process.exit(0)
  }

  console.error(`✗ validate-step-defs: ${problems.length} problem(s) found`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

module.exports = {
  validateAllStepDefinitions,
  validateStepDefinitionsFile,
  validateStepEntry,
  countCaptureGroups,
}

if (require.main === module) {
  validateAllStepDefinitions()
}
