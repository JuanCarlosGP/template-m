#!/usr/bin/env node

'use strict'

/**
 * Extract gherkin dictionary and serve the static UI (cross-platform).
 * Official entry point — npm run gherkin-report
 */
const { execFileSync, spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const REPORTS_DIR = path.join(__dirname, 'gherkin-dictionary', 'reports')

function parseArgs(argv) {
  let port = 8080
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') {
      port = parseInt(argv[++i], 10)
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      return { help: true, port }
    }
  }
  if (process.env.PORT) {
    port = parseInt(process.env.PORT, 10) || port
  }
  return { help: false, port }
}

function resolveHttpServerBin() {
  return require.resolve('http-server/bin/http-server')
}

function main() {
  const { help, port } = parseArgs(process.argv.slice(2))

  if (help) {
    console.log('Usage: npm run gherkin-report [-- --port 8080]')
    console.log('')
    console.log('Regenerates the gherkin dictionary and serves the UI at http://localhost:<port>')
    console.log('Env: PORT overrides default 8080')
    process.exit(0)
  }

  console.log('=== gherkin-extract ===')
  execFileSync(process.execPath, [path.join(__dirname, 'gherkin-dictionary', 'extract.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  const httpServer = resolveHttpServerBin()
  console.log(`\n=== gherkin-report UI on http://localhost:${port} ===`)
  const result = spawnSync(
    process.execPath,
    [httpServer, REPORTS_DIR, '-c-1', '-a', 'localhost', '-p', String(port), '-o', 'index.html'],
    { cwd: ROOT, stdio: 'inherit' },
  )
  process.exit(result.status || 0)
}

main()
