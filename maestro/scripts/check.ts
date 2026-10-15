#!/usr/bin/env tsx
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { extractGherkinData } from './gherkin-dictionary/lib/extractGherkinData.js'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Headless quality gate for CI — stack-agnostic.
 * Runs unit tests, static validation, and gherkin dictionary extract (strict).
 */

const ROOT = path.join(__dirname, '..', '..')

/** Same files as `npm test` in package.json — keep in sync by parsing the script. */
function getTestFilesFromPackage() {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const testScript = scripts?.test
  const marker = '--test '
  const idx = typeof testScript === 'string' ? testScript.indexOf(marker) : -1
  if (idx === -1) {
    throw new Error('package.json scripts.test must include "--test "')
  }
  return testScript.slice(idx + marker.length).split(/\s+/).filter(Boolean)
}

async function main() {
  console.log('\n=== npm test ===')
  execFileSync(process.execPath, ['--import', 'tsx', '--test', ...getTestFilesFromPackage()], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  console.log('\n=== typecheck ===')
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js'), '--noEmit'], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  console.log('\n=== validate ===')
  execFileSync(process.execPath, ['--import', 'tsx', 'maestro/scripts/validate.ts'], {
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
