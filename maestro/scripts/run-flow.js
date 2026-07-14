#!/usr/bin/env node

'use strict'

/**
 * Cross-platform wrapper for direct Maestro flow runs (`npm run flow:android|flow:ios`).
 */
const path = require('path')
const {
  getMaestroBinary,
  execMaestroSync,
  appendMaestroEnvArgs,
  buildMaestroTestArgs,
} = require('./resolve-maestro-bin')

function parseArgs(argv) {
  const args = { platform: null, flow: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--platform') args.platform = argv[++i]
    else if (argv[i] === '--flow') args.flow = argv[++i]
  }
  return args
}

const args = parseArgs(process.argv)

if (!args.platform || !['android', 'ios'].includes(args.platform)) {
  console.error('Error: --platform android|ios is required')
  process.exit(1)
}
if (!args.flow) {
  console.error('Error: --flow maestro/flows/<Name>.yml is required')
  process.exit(1)
}

const flowPath = path.resolve(args.flow)
const maestroDir = path.join(__dirname, '..')
let flowFile
if (flowPath.startsWith(maestroDir)) {
  flowFile = path.relative(maestroDir, flowPath).replace(/\\/g, '/')
} else {
  flowFile = flowPath.replace(/^maestro[/\\]/, '').replace(/\\/g, '/')
}
const isAndroid = args.platform === 'android'

const appId = isAndroid
  ? process.env.ANDROID_APP_ID || ''
  : process.env.IOS_APP_ID || ''
const appName = isAndroid
  ? process.env.ANDROID_APP_NAME || process.env.APP_NAME || ''
  : process.env.IOS_APP_NAME || process.env.APP_NAME || ''

if (!appId) {
  console.error(`Error: set ${isAndroid ? 'ANDROID_APP_ID' : 'IOS_APP_ID'} in .env`)
  process.exit(1)
}

const env = { APP_ID: appId }
if (appName) env.APP_NAME = appName

async function main() {
  const { maestroArgs, cwd } = buildMaestroTestArgs(args.platform)
  appendMaestroEnvArgs(maestroArgs, env)
  maestroArgs.push(flowFile)

  console.log(`Running: ${getMaestroBinary()} ${maestroArgs.join(' ')}`)
  console.log(`cwd: ${cwd}`)

  try {
    await execMaestroSync(maestroArgs, { cwd, flowFile })
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.errno === -4058)) {
      console.error('Maestro CLI not found. Run npm run setup or set MAESTRO_CLI in .env (https://docs.maestro.dev/getting-started/installing-maestro)')
    }
    process.exit(err.status || 1)
  }
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
