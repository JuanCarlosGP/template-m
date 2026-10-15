#!/usr/bin/env tsx
import fs from 'fs'
import path from 'path'
import { resolveStep, resolveMaestroFlowFile } from '../step-definitions/index.js'
import { getPickles, getPickleStepTexts, pickleLabel } from './lib/gherkin.js'
import { validateAllStepDefinitions } from './validate-step-defs.js'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Static validator for the Gherkin -> step-definitions -> flows chain.
//
// Checks, without touching a device:
//   0. Every step-definitions/*.json matches schema (pattern, flow, params, regex).
//   1. Every .feature file parses as valid Gherkin.
//   2. Every step in every executable pickle resolves to a step definition.
//   3. Every non-null flow referenced by a step resolves under maestro/shared/.
//   4. Every Maestro YAML (recursive under shared/ios/android) has a valid
//      frontmatter block (header + `---`).
//   5. maestro/flows/ is retired.
//
// Exit code 0 = all good, 1 = at least one problem found.
// ---------------------------------------------------------------------------

const MAESTRO_DIR = path.join(__dirname, '..')
const FEATURES_DIR = path.join(MAESTRO_DIR, 'features')
const LEGACY_FLOWS_DIR = path.join(MAESTRO_DIR, 'flows')
const FLOW_ROOTS = ['shared', 'ios', 'android'].map(d => path.join(MAESTRO_DIR, d))

function listYmlFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listYmlFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.yml')) found.push(full)
  }
  return found
}

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
          const flowFile = resolveMaestroFlowFile(resolved.flow)
          if (!flowFile) {
            problems.push(`${file} › ${label}: step "${stepText}" maps to flow "${resolved.flow}" but maestro/shared/${resolved.flow}.yml was not found`)
          }
        }
      }
    }
  }
}

// 4 — every flow yml has a frontmatter block
function validateFlowFrontmatter() {
  for (const dir of FLOW_ROOTS) {
    for (const filePath of listYmlFiles(dir)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const rel = path.relative(MAESTRO_DIR, filePath).replace(/\\/g, '/')
      if (!/^---$/m.test(content)) {
        problems.push(`${rel}: missing the "---" frontmatter separator`)
      }
    }
  }
}

function validateNoLegacyFlowsDir() {
  const leftover = listYmlFiles(LEGACY_FLOWS_DIR)
  if (leftover.length === 0) return
  const names = leftover.map(p => path.relative(MAESTRO_DIR, p).replace(/\\/g, '/')).join(', ')
  problems.push(`maestro/flows/ is retired — put entry YAML in shared/<area>/ (found ${names})`)
}

function main() {
  problems.push(...validateAllStepDefinitions({ collectOnly: true }))
  validateFeatures()
  validateFlowFrontmatter()
  validateNoLegacyFlowsDir()

  if (problems.length === 0) {
    console.log('✓ validate: Gherkin, step-definitions and shared flows are consistent')
    process.exit(0)
  }

  console.error(`✗ validate: ${problems.length} problem(s) found`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

main()
