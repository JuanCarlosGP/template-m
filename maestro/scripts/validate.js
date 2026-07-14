#!/usr/bin/env node

'use strict'

// ---------------------------------------------------------------------------
// Static validator for the Gherkin -> step-definitions -> flows chain.
//
// Checks, without touching a device:
//   0. Every step-definitions/*.json matches schema (pattern, flow, params, regex).
//   1. Every .feature file parses as valid Gherkin.
//   2. Every step in every executable pickle resolves to a step definition.
//   3. Every non-null flow referenced by a step has a flows/<name>.yml file.
//   4. Every Maestro flow file has a valid frontmatter block (header + `---`).
//
// Exit code 0 = all good, 1 = at least one problem found.
// ---------------------------------------------------------------------------

const fs = require('fs')
const path = require('path')
const { resolveStep } = require('../step-definitions/index')
const { getPickles, getPickleStepTexts, pickleLabel } = require('./lib/gherkin')
const { validateAllStepDefinitions } = require('./validate-step-defs')

const MAESTRO_DIR = path.join(__dirname, '..')
const FEATURES_DIR = path.join(MAESTRO_DIR, 'features')
const FLOWS_DIR = path.join(MAESTRO_DIR, 'flows')
const FLOW_DIRS = ['flows', 'shared', 'ios', 'android'].map(d => path.join(MAESTRO_DIR, d))

const problems = []

function countPickleNames(pickles) {
  const counts = new Map()
  for (const pickle of pickles) {
    counts.set(pickle.name, (counts.get(pickle.name) || 0) + 1)
  }
  return counts
}

// 1 + 2 + 3 — features parse, pickle steps resolve, referenced flows exist
function validateFeatures() {
  if (!fs.existsSync(FEATURES_DIR)) return
  const files = fs.readdirSync(FEATURES_DIR).filter(f => f.endsWith('.feature')).sort()

  for (const file of files) {
    const filePath = path.join(FEATURES_DIR, file)
    let pickles
    try {
      pickles = getPickles(filePath)
    } catch (err) {
      problems.push(`${file}: Gherkin parse error — ${err.message}`)
      continue
    }

    if (pickles.length === 0) {
      problems.push(`${file}: no executable scenarios (pickles) found`)
      continue
    }

    const nameCounts = countPickleNames(pickles)
    const nameIndex = new Map()

    for (const pickle of pickles) {
      const idx = nameIndex.get(pickle.name) || 0
      nameIndex.set(pickle.name, idx + 1)
      const label = pickleLabel(pickle, idx, nameCounts.get(pickle.name))

      for (const stepText of getPickleStepTexts(pickle)) {
        let resolved
        try {
          resolved = resolveStep(stepText)
        } catch (err) {
          problems.push(`${file} › ${label}: ${err.message}`)
          continue
        }
        if (resolved.flow) {
          const flowFile = path.join(FLOWS_DIR, `${resolved.flow}.yml`)
          if (!fs.existsSync(flowFile)) {
            problems.push(`${file} › ${label}: step "${stepText}" maps to flow "${resolved.flow}" but flows/${resolved.flow}.yml does not exist`)
          }
        }
      }
    }
  }
}

// 4 — every flow yml has a frontmatter block
function validateFlowFrontmatter() {
  for (const dir of FLOW_DIRS) {
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.yml'))) {
      const filePath = path.join(dir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const rel = path.relative(MAESTRO_DIR, filePath)
      if (!/^---$/m.test(content)) {
        problems.push(`${rel}: missing the "---" frontmatter separator`)
      }
    }
  }
}

function main() {
  problems.push(...validateAllStepDefinitions({ collectOnly: true }))
  validateFeatures()
  validateFlowFrontmatter()

  if (problems.length === 0) {
    console.log('✓ validate: Gherkin, step-definitions and flows are consistent')
    process.exit(0)
  }

  console.error(`✗ validate: ${problems.length} problem(s) found`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

main()
