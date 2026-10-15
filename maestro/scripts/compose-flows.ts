#!/usr/bin/env tsx
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { DEFAULT_FEATURES_DIR, DEFAULT_OUT_DIR, writeFeatureScenarioComposers, writeAllScenarioComposers, writeWorkspaceConfig } from './lib/compose-flows.js'
import { execMaestroSync, appendMaestroEnvArgs, buildMaestroTestArgs, prepareMaestroAndroidBeforeCliRun } from './resolve-maestro-bin.js'
import { fileURLToPath, pathToFileURL } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Generate thin composer YAMLs (runFlow file: only) from Gherkin features and
 * optionally run them in one Maestro CLI invocation.
 *
 *   node maestro/scripts/compose-flows.js --feature maestro/features/MyDemoAppAuth.feature
 *   node maestro/scripts/compose-flows.js --all-features --run --platform android
 */

dotenv.config({
  path: path.join(__dirname, '..', '..', '.env'),
})

function parseArgs(argv) {
  const args: any = { _: [] }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--feature') args.feature = argv[++i]
    else if (a === '--all-features') args.allFeatures = true
    else if (a === '--features-dir') args.featuresDir = argv[++i]
    else if (a === '--out-dir') args.outDir = argv[++i]
    else if (a === '--run') args.run = true
    else if (a === '--platform') args.platform = argv[++i]
    else if (a === '--help' || a === '-h') args.help = true
    else args._.push(a)
  }
  return args
}

function usage() {
  console.log(`Usage:
  node maestro/scripts/compose-flows.js --feature <path> [--run --platform android|ios]
  node maestro/scripts/compose-flows.js --all-features [--run --platform android|ios]

  --out-dir   default: maestro/.tmp/scenarios/
  --features-dir  default: maestro/features/
`)
}

function runEnv(platform) {
  const appId = platform === 'android'
    ? process.env.ANDROID_APP_ID || ''
    : process.env.IOS_APP_ID || ''
  const appName = platform === 'android'
    ? process.env.ANDROID_APP_NAME || process.env.APP_NAME || ''
    : process.env.IOS_APP_NAME || process.env.APP_NAME || ''
  return {
    PLATFORM: platform,
    ...(appId ? { APP_ID: appId } : {}),
    ...(appName ? { APP_NAME: appName } : {}),
    ...(process.env.USERNAME ? { USERNAME: process.env.USERNAME } : {}),
    ...(process.env.PASSWORD ? { PASSWORD: process.env.PASSWORD } : {}),
    ...(process.env.MOCK_SERVER_URL ? { MOCK_SERVER_URL: process.env.MOCK_SERVER_URL } : {}),
  }
}

function applyConfigPath(maestroArgs, configPath) {
  if (!configPath) return
  const idx = maestroArgs.indexOf('--config')
  if (idx !== -1) maestroArgs.splice(idx, 2, '--config', configPath)
  else maestroArgs.splice(1, 0, '--config', configPath)
}

async function runComposed(targets, platform, { configPath } = {} as any) {
  if (platform === 'android') prepareMaestroAndroidBeforeCliRun()
  const { maestroArgs, cwd } = buildMaestroTestArgs(platform)
  applyConfigPath(maestroArgs, configPath)
  appendMaestroEnvArgs(maestroArgs, runEnv(platform))
  for (const t of targets) maestroArgs.push(t)
  console.log(`  Running: maestro ${maestroArgs.join(' ')}`)
  await execMaestroSync(maestroArgs, { cwd })
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    usage()
    process.exit(0)
  }
  if (!args.feature && !args.allFeatures) {
    usage()
    process.exit(1)
  }
  if (args.feature && args.allFeatures) {
    console.error('Error: --feature and --all-features are mutually exclusive')
    process.exit(1)
  }
  if (args.run && !args.platform) {
    console.error('Error: --run requires --platform android|ios')
    process.exit(1)
  }

  const outDir = args.outDir
    ? path.resolve(args.outDir)
    : DEFAULT_OUT_DIR
  const featuresDir = args.featuresDir || DEFAULT_FEATURES_DIR

  let written
  if (args.allFeatures) {
    written = writeAllScenarioComposers(featuresDir, outDir)
  } else {
    const featurePath = path.resolve(args.feature)
    if (!fs.existsSync(featurePath)) {
      console.error(`Error: Feature file not found: ${featurePath}`)
      process.exit(1)
    }
    written = writeFeatureScenarioComposers(featurePath, outDir)
  }

  for (const w of written) {
    console.log(`Wrote ${w.composerPath}`)
    console.log(`  flows: ${w.flows.map(f => f.id).join(', ') || '(none)'}`)
  }

  if (!args.run) return

  const composerPaths = written.map(w => w.composerPath)
  if (args.allFeatures) {
    const configPath = writeWorkspaceConfig(outDir)
    await runComposed([outDir], args.platform, { configPath })
  } else {
    await runComposed(composerPaths, args.platform)
  }
}

export { parseArgs, runEnv, runComposed }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err.message || err)
    process.exit(1)
  })
}
