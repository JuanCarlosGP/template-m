#!/usr/bin/env node

'use strict'

/**
 * Install the pinned Maestro CLI (Unix) or print Windows instructions.
 * Single source of truth for MAESTRO_VERSION (used by npm run setup).
 */
const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const MAESTRO_VERSION = '2.6.0'
const MAESTRO_DOCS = 'https://docs.maestro.dev/getting-started/installing-maestro'

const maestroBinDir = path.join(os.homedir(), '.maestro', 'bin')
const maestroBin = path.join(maestroBinDir, process.platform === 'win32' ? 'maestro.bat' : 'maestro')

function parseArgs(argv) {
  return {
    strict: argv.includes('--strict'),
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

function maestroPathEnv() {
  const sep = process.platform === 'win32' ? ';' : ':'
  const current = process.env.PATH || ''
  if (current.split(sep).includes(maestroBinDir)) return current
  return `${maestroBinDir}${sep}${current}`
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim()
  } catch {
    return null
  }
}

function getInstalledVersion() {
  const env = { ...process.env, PATH: maestroPathEnv() }
  const out = run('maestro --version', { env })
  if (!out) return null
  const line = out.split('\n').pop().trim()
  return line || null
}

function versionMatches(installed) {
  if (!installed) return false
  return installed === MAESTRO_VERSION || installed.startsWith(`${MAESTRO_VERSION}.`)
}

function printWindowsInstructions() {
  console.log('')
  console.log('Maestro CLI is not installed (or not on PATH).')
  console.log('')
  console.log('On Windows, install Maestro manually:')
  console.log(`  ${MAESTRO_DOCS}`)
  console.log('')
  console.log('After install, verify with:  maestro --version')
  console.log('Optional: set MAESTRO_CLI in .env to the full path of the binary.')
}

function installUnix() {
  console.log(`Installing Maestro CLI ${MAESTRO_VERSION}...`)
  const env = { ...process.env, PATH: maestroPathEnv(), MAESTRO_VERSION }
  const result = spawnSync('bash', ['-c', 'curl -Ls "https://get.maestro.mobile.dev" | bash'], {
    stdio: 'inherit',
    env,
  })
  if (result.status !== 0) {
    console.error('Maestro install failed.')
    process.exit(result.status || 1)
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log('Usage: node maestro/scripts/install-maestro.js [--strict]')
    console.log('')
    console.log(`Pinned version: ${MAESTRO_VERSION}`)
    console.log('--strict  exit 1 on Windows when Maestro is missing (default: soft warn)')
    process.exit(0)
  }

  const installed = getInstalledVersion()
  if (versionMatches(installed)) {
    console.log(`Maestro ${MAESTRO_VERSION} already installed`)
    process.exit(0)
  }

  if (installed) {
    console.log(`Maestro ${installed} found — upgrading to ${MAESTRO_VERSION}...`)
  }

  if (process.platform === 'win32') {
    if (fs.existsSync(maestroBin) || run('where maestro')) {
      const ver = getInstalledVersion()
      if (ver) {
        console.log(`Maestro CLI found (${ver}). Expected ${MAESTRO_VERSION}.`)
        console.log('Upgrade manually if needed — see docs.')
        process.exit(0)
      }
    }
    printWindowsInstructions()
    process.exit(args.strict ? 1 : 0)
  }

  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    console.warn(`Unsupported platform: ${process.platform}. Install Maestro manually.`)
    console.warn(MAESTRO_DOCS)
    process.exit(args.strict ? 1 : 0)
  }

  installUnix()

  const after = getInstalledVersion()
  if (versionMatches(after)) {
    console.log(`Maestro ${MAESTRO_VERSION} installed successfully`)
    process.exit(0)
  }

  console.warn('Maestro install finished but version check did not match.')
  console.warn(`Expected ${MAESTRO_VERSION}, got: ${after || '(not found)'}`)
  process.exit(1)
}

if (require.main === module) {
  main()
}

module.exports = { MAESTRO_VERSION, MAESTRO_DOCS, getInstalledVersion, versionMatches }
