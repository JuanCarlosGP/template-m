#!/usr/bin/env node

'use strict'

/**
 * Headless quality gate for CI — stack-agnostic.
 * Runs unit tests, static validation, and gherkin dictionary extract (strict).
 */
const { execFileSync } = require('child_process')
const path = require('path')
const { extractGherkinData } = require('./gherkin-dictionary/lib/extractGherkinData')

const ROOT = path.join(__dirname, '..', '..')

/** Same files as `npm test` in package.json — keep in sync by parsing the script. */
function getTestFilesFromPackage() {
  const { scripts } = require(path.join(ROOT, 'package.json'))
  const testScript = scripts?.test
  if (!testScript?.startsWith('node --test ')) {
    throw new Error('package.json scripts.test must start with "node --test "')
  }
  return testScript.slice('node --test '.length).split(/\s+/).filter(Boolean)
}

async function main() {
  console.log('\n=== npm test ===')
  execFileSync(process.execPath, ['--test', ...getTestFilesFromPackage()], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  console.log('\n=== validate ===')
  execFileSync(process.execPath, ['maestro/scripts/validate.js'], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  console.log('\n=== gherkin-extract ===')
  const { analytics } = await extractGherkinData()
  if (analytics.pasosSinDefinicion > 0) {
    console.error(`✗ check: ${analytics.pasosSinDefinicion} paso(s) sin definición`)
    process.exit(1)
  }
  console.log('✓ gherkin-extract: pasosSinDefinicion = 0')

  console.log('\n✓ check: all headless gates passed')
}

main().catch(err => {
  console.error('✗ check failed:', err.message || err)
  process.exit(1)
})
