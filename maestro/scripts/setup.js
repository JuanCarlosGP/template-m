#!/usr/bin/env node

'use strict'

/**
 * Cross-platform bootstrap: .env, npm install, Maestro CLI, doctor.
 * Official entry point — npm run setup
 */
const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const ENV_EXAMPLE = path.join(ROOT, '.env.example')
const ENV_FILE = path.join(ROOT, '.env')

function parseArgs(argv) {
  return {
    skipMaestro: argv.includes('--skip-maestro'),
    skipDoctor: argv.includes('--skip-doctor'),
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

function ensureEnv() {
  if (fs.existsSync(ENV_FILE)) {
    console.log('.env already present')
    return
  }
  if (!fs.existsSync(ENV_EXAMPLE)) {
    console.error('.env.example not found — cannot create .env')
    process.exit(1)
  }
  fs.copyFileSync(ENV_EXAMPLE, ENV_FILE)
  console.log('.env created from .env.example — fill in credentials and optional Azure vars')
}

function npmInstall() {
  console.log('\n=== npm install ===')
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function installMaestro() {
  console.log('\n=== Maestro CLI ===')
  execFileSync(process.execPath, [path.join(__dirname, 'install-maestro.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  })
}

function runDoctor() {
  console.log('\n=== doctor ===')
  execFileSync(process.execPath, [path.join(__dirname, 'doctor.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  })
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    console.log('Usage: npm run setup [-- --skip-maestro] [-- --skip-doctor]')
    console.log('')
    console.log('Bootstrap: .env + npm install + Maestro CLI + doctor preflight')
    process.exit(0)
  }

  console.log('Izertis Maestro Template — setup\n')

  ensureEnv()
  npmInstall()

  if (!args.skipMaestro) {
    installMaestro()
  }

  if (!args.skipDoctor) {
    runDoctor()
  }

  console.log('')
  console.log('Setup complete.')
  console.log('  • Fill in .env (USERNAME, PASSWORD, optional AZURE_DEVOPS_PAT).')
  console.log('  • The Azure DevOps MCP runs in a separate process and may not inherit shell env vars from .env.')
  console.log('  • Run npm run check for headless validation (CI gate).')
}

main()
