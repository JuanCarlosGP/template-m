#!/usr/bin/env node

'use strict'

// Preflight / environment doctor. Run via `npm run doctor`.
// Reports whether every prerequisite for running the suite is in place and exits
// non-zero if a HARD requirement is missing, so it can gate `npm run setup`.
//
//   HARD (exit 1 if missing): Node deps installed, Maestro CLI, at least one of
//                             xcrun/adb for the platforms you intend to run.
//   SOFT (warn only):         AZURE_DEVOPS_PAT, a booted device, APP_SOURCE_DIR.

const { execFileSync, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
let hardFailures = 0

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

/** Resolve a CLI on PATH (where on Windows, which elsewhere). Falls back to running `<name> version`. */
function resolveBinOnPath(name) {
  const lookup = process.platform === 'win32' ? 'where' : 'which'
  try {
    const out = execFileSync(lookup, [name], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const first = out.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (first) return first
  } catch (_) {}

  try {
    execFileSync(name, ['version'], { stdio: ['ignore', 'pipe', 'ignore'] })
    return name
  } catch (_) {
    return null
  }
}

function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
function warn(msg) { console.log(`  \x1b[33m!\x1b[0m ${msg}`) }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); hardFailures++ }

console.log('Izertis Maestro Template — doctor\n')

// --- Hard requirements --------------------------------------------------------
console.log('Toolchain:')

const node = run('node -v')
node ? ok(`Node ${node}`) : fail('Node not found')

// Node deps installed?
try {
  require.resolve('@cucumber/gherkin', { paths: [ROOT] })
  ok('npm dependencies installed (@cucumber/gherkin resolves)')
} catch {
  fail('npm dependencies missing — run `npm install` or `npm run setup`')
}

// Azure DevOps MCP server package present locally (so .mcp.json npx resolves offline)
try {
  require.resolve('@azure-devops/mcp/package.json', { paths: [ROOT] })
  ok('Azure DevOps MCP server installed')
} catch {
  warn('Azure DevOps MCP server not installed locally — `npm install` will fetch it (npx falls back to network)')
}

const maestro = run('maestro --version')
maestro ? ok(`Maestro CLI ${maestro}`) : fail('Maestro CLI not found — run `npm run setup` or install manually (https://docs.maestro.dev/getting-started/installing-maestro)')

// --- Platform tooling ---------------------------------------------------------
console.log('\nPlatform tooling:')
const xcrun = resolveBinOnPath('xcrun')
xcrun ? ok('xcrun (iOS) available') : warn('xcrun not found — iOS runs unavailable')
const adb = resolveBinOnPath('adb')
adb ? ok('adb (Android) available') : warn('adb not found — Android runs unavailable')
if (!xcrun && !adb) fail('neither xcrun nor adb found — cannot run on any platform')

// --- Devices (informational) --------------------------------------------------
console.log('\nDevices:')
const booted = (run('xcrun simctl list devices booted') || '').split('\n').filter(l => l.includes('(Booted)'))
booted.length ? booted.forEach(l => ok(`iOS booted: ${l.trim()}`)) : warn('no iOS simulator booted (start one in Xcode)')
const droid = (run('adb devices') || '').split('\n').slice(1).filter(l => /\bdevice\b/.test(l))
droid.length ? ok(`Android: ${droid.length} device(s) connected`) : warn('no Android device/emulator (start one in Android Studio)')

// --- Config (soft) ------------------------------------------------------------
console.log('\nConfig:')
fs.existsSync(path.join(ROOT, '.env')) ? ok('.env present') : warn('.env missing — run `npm run setup`')
process.env.AZURE_DEVOPS_PAT
  ? ok('AZURE_DEVOPS_PAT available (used by the runner for publishing results)')
  : warn('AZURE_DEVOPS_PAT not in this env — runner reads it from .env for publishing; the Azure MCP is independent (interactive browser login)')
const appSrc = process.env.APP_SOURCE_DIR || path.join(ROOT, '..', 'your-mobile-app')
fs.existsSync(appSrc) ? ok(`APP_SOURCE_DIR: ${appSrc}`) : warn(`APP_SOURCE_DIR not found: ${appSrc}`)

// --- Verdict ------------------------------------------------------------------
console.log('')
if (hardFailures > 0) {
  console.error(`\x1b[31mDoctor found ${hardFailures} blocking issue(s).\x1b[0m`)
  process.exit(1)
}
console.log('\x1b[32mAll hard requirements satisfied.\x1b[0m')
process.exit(0)
