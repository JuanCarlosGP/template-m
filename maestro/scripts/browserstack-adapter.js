#!/usr/bin/env node

'use strict'

/**
 * BrowserStack App Automate adapter for Maestro flows.
 *
 * Replaces the local `maestro test` CLI call with BrowserStack REST API calls:
 *   1. Upload app binary (cached per run)
 *   2. Zip + upload flow files
 *   3. Trigger build on target device
 *   4. Poll until complete
 *   5. Return pass/fail per scenario
 *
 * Required env vars:
 *   BROWSERSTACK_USERNAME                   BrowserStack account username
 *   BROWSERSTACK_ACCESS_KEY                 BrowserStack access key
 *   BROWSERSTACK_ANDROID_DEVICE             Device string, e.g. "Samsung Galaxy S21-11.0"
 *   BROWSERSTACK_IOS_DEVICE                 Device string, e.g. "iPhone 14-16"
 *
 * App binaries — one per environment per platform:
 *   BROWSERSTACK_PRODUCTION_ANDROID_APP_FILE  Path to production .apk
 *   BROWSERSTACK_PRODUCTION_IOS_APP_FILE      Path to production .app/.ipa
 *   BROWSERSTACK_STAGING_ANDROID_APP_FILE     Path to staging .apk
 *   BROWSERSTACK_STAGING_IOS_APP_FILE         Path to staging .app/.ipa
 *   BROWSERSTACK_MOCK_ANDROID_APP_FILE        Path to mock .apk (can be same as staging)
 *   BROWSERSTACK_MOCK_IOS_APP_FILE            Path to mock .app/.ipa (can be same as staging)
 *
 *   Fallback (used when the environment-specific var is not set):
 *   BROWSERSTACK_ANDROID_APP_FILE
 *   BROWSERSTACK_IOS_APP_FILE
 *
 * Optional env vars:
 *   MOCK_SERVER_URL                URL of the mock server, passed to flows as MOCK_SERVER_URL
 *                                  (e.g. "http://localhost:3000"). Only used with --environment mock.
 *                                  Shared with local executor — same var name.
 *   BROWSERSTACK_LOCAL_BINARY      Path to BrowserStackLocal binary (default: "BrowserStackLocal")
 *   BROWSERSTACK_LOCAL_IDENTIFIER  Tunnel identifier (default: "maestro-tunnel")
 *   BROWSERSTACK_POLL_INTERVAL_MS  Polling interval in ms (default: 10000)
 *   BROWSERSTACK_TIMEOUT_MS        Max wait for build in ms (default: 600000)
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

function getCredentials() {
  const username = process.env.BROWSERSTACK_USERNAME
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY
  if (!username) throw new Error('BROWSERSTACK_USERNAME env var is required')
  if (!accessKey) throw new Error('BROWSERSTACK_ACCESS_KEY env var is required')
  return { username, accessKey }
}

function authHeader({ username, accessKey }) {
  return 'Basic ' + Buffer.from(`${username}:${accessKey}`).toString('base64')
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} ${options.method} ${options.path}: ${data}`))
          return
        }
        try { resolve(JSON.parse(data)) } catch { resolve(data) }
      })
    })
    req.on('error', reject)
    if (body) req.end(body)
    else req.end()
  })
}

function apiGet(urlPath, credentials) {
  return httpRequest({
    hostname: 'api-cloud.browserstack.com',
    path: urlPath,
    method: 'GET',
    headers: {
      Authorization: authHeader(credentials),
      Accept: 'application/json',
    },
  })
}

function apiPost(urlPath, payload, credentials) {
  const body = JSON.stringify(payload)
  return httpRequest({
    hostname: 'api-cloud.browserstack.com',
    path: urlPath,
    method: 'POST',
    headers: {
      Authorization: authHeader(credentials),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Accept: 'application/json',
    },
  }, body)
}

function uploadMultipart(urlPath, filePath, credentials) {
  const boundary = `----BoundaryMaestro${Date.now().toString(16)}`
  const fileBuffer = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  )
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`)
  const body = Buffer.concat([preamble, fileBuffer, epilogue])

  return httpRequest({
    hostname: 'api-cloud.browserstack.com',
    path: urlPath,
    method: 'POST',
    headers: {
      Authorization: authHeader(credentials),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
      Accept: 'application/json',
    },
  }, body)
}

// ---------------------------------------------------------------------------
// App upload — cached per process to avoid re-uploading on every scenario
// ---------------------------------------------------------------------------

const _appUrlCache = {}

async function uploadApp(appFile, platform, credentials) {
  if (!appFile) {
    throw new Error(
      `App file not set. Define BROWSERSTACK_${platform.toUpperCase()}_APP_FILE env var ` +
      `pointing to your ${platform === 'android' ? '.apk' : '.app/.ipa'} file.`
    )
  }
  if (!fs.existsSync(appFile)) {
    throw new Error(`App file not found: ${appFile}`)
  }

  if (_appUrlCache[appFile]) {
    console.log(`  [BS] Reusing cached app upload: ${path.basename(appFile)}`)
    return _appUrlCache[appFile]
  }

  console.log(`  [BS] Uploading app: ${path.basename(appFile)} ...`)
  const res = await uploadMultipart('/app-automate/maestro/v2/app', appFile, credentials)

  if (!res.app_url) throw new Error(`App upload failed: ${JSON.stringify(res)}`)
  console.log(`  [BS] App ready: ${res.app_url}`)
  _appUrlCache[appFile] = res.app_url
  return res.app_url
}

// ---------------------------------------------------------------------------
// Flows zip + upload
// Zips all YAML files under maestro/ (excluding build/, scripts/, features/,
// step-definitions/) so that internal runFlow references resolve correctly.
// ---------------------------------------------------------------------------

function collectYamlFiles(dir, exclude = []) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!exclude.includes(entry.name)) {
        results.push(...collectYamlFiles(full, exclude))
      }
    } else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      results.push(full)
    }
  }
  return results
}

async function uploadFlowSuite(maestroDir, credentials) {
  try {
    execFileSync('zip', ['--version'], { stdio: 'pipe' })
  } catch {
    throw new Error(
      '`zip` command not found. Install it before using the BrowserStack executor.\n' +
      '  macOS: built-in\n' +
      '  Ubuntu/Debian: apt-get install zip'
    )
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-suite-'))
  const zipPath = path.join(tmpDir, 'suite.zip')

  try {
    const yamlFiles = collectYamlFiles(maestroDir, [
      'build', 'scripts', 'features', 'step-definitions',
    ])

    if (yamlFiles.length === 0) {
      throw new Error(`No YAML flow files found under ${maestroDir}`)
    }

    // Build zip preserving relative paths from maestroDir
    const relPaths = yamlFiles.map(f => path.relative(maestroDir, f))
    console.log(`  [BS] Zipping ${relPaths.length} flow files...`)
    execFileSync('zip', [zipPath, ...relPaths], { cwd: maestroDir, stdio: 'pipe' })

    console.log(`  [BS] Uploading flow suite...`)
    const res = await uploadMultipart(
      '/app-automate/maestro/v2/test-suite',
      zipPath,
      credentials
    )

    if (!res.test_suite_url) throw new Error(`Suite upload failed: ${JSON.stringify(res)}`)
    console.log(`  [BS] Suite ready: ${res.test_suite_url}`)
    return res.test_suite_url
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Build trigger
// ---------------------------------------------------------------------------

async function triggerBuild(appUrl, testSuiteUrl, platform, device, flowRelPaths, envVars, options, credentials) {
  const endpoint = platform === 'android'
    ? '/app-automate/maestro/v2/android/build'
    : '/app-automate/maestro/v2/ios/build'

  const payload = {
    app: appUrl,
    testSuite: testSuiteUrl,
    devices: [device],
    execute: flowRelPaths,
    deviceLogs: 'true',
    // NOTE: env vars support in BrowserStack Maestro API — verify field name
    // at https://www.browserstack.com/docs/app-automate/maestro/get-started
    // and adjust if needed.
    ...(Object.keys(envVars).length > 0 && { envVariables: envVars }),
    ...(options.local && {
      local: 'true',
      localIdentifier: options.localIdentifier || 'maestro-tunnel',
    }),
  }

  console.log(`  [BS] Triggering build on ${device} (${platform})`)
  const res = await apiPost(endpoint, payload, credentials)

  if (!res.build_id) throw new Error(`Build trigger failed: ${JSON.stringify(res)}`)
  console.log(`  [BS] Build started: ${res.build_id}`)
  return res.build_id
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(['passed', 'failed', 'error', 'timeout', 'done', 'completed'])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry(fn, retries = 2) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < retries && !err.message.startsWith('HTTP ')) {
        console.warn(`  [BS] Network error, retrying (${i + 1}/${retries}): ${err.message}`)
        await sleep(2000 * (i + 1))
      }
    }
  }
  throw lastErr
}

async function pollBuild(buildId, credentials) {
  const intervalMs = Number(process.env.BROWSERSTACK_POLL_INTERVAL_MS) || 10_000
  const timeoutMs = Number(process.env.BROWSERSTACK_TIMEOUT_MS) || 600_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await withRetry(() => apiGet(
      `/app-automate/maestro/v2/builds/${buildId}`,
      credentials
    ))

    // BrowserStack may return status at build level or per-device
    const status = (res.status || res.build_status || '').toLowerCase()

    if (TERMINAL_STATUSES.has(status)) {
      console.log(`  [BS] Build ${buildId} finished: ${status}`)
      return res
    }

    console.log(`  [BS] Build ${buildId}: ${status || 'running'} — polling in ${intervalMs / 1000}s...`)
    await sleep(intervalMs)
  }

  throw new Error(`Build ${buildId} timed out after ${timeoutMs / 1000}s`)
}

// ---------------------------------------------------------------------------
// Result parsing
// BrowserStack returns something like:
// { devices: [{ device, tests: [{ name, status, reason }] }] }
// Adjust if the actual shape differs after testing.
// ---------------------------------------------------------------------------

function parseBuildResult(buildResult, flowRelPaths) {
  // Flatten all test results from all devices
  const tests = (buildResult.devices || []).flatMap(d => d.tests || [])

  if (tests.length === 0) {
    // No test-level data — fall back to top-level status
    const status = (buildResult.status || '').toLowerCase()
    if (status !== 'passed') {
      console.error(`  [BS] Build result (raw): ${JSON.stringify(buildResult)}`)
    }
    if (status === 'passed') return { status: 'passed', error: null }
    return { status: 'failed', error: `Build status: ${status}` }
  }

  const failed = tests.find(t => (t.status || '').toLowerCase() !== 'passed')
  if (failed) {
    console.error(`  [BS] Failed test (raw): ${JSON.stringify(failed)}`)
    return {
      status: 'failed',
      error: `Flow "${failed.name}" failed${failed.reason ? ': ' + failed.reason : ''}`,
    }
  }
  return { status: 'passed', error: null }
}

// ---------------------------------------------------------------------------
// BrowserStack Local tunnel (daemon mode)
//
// Uses --daemon start/stop so the tunnel runs as a background OS process,
// independent of our Node process. This means:
//   - The tunnel survives if the Node process crashes mid-run.
//   - stopLocalTunnel() must always be called (handled via try/finally in runner).
//   - The binary must be downloaded separately and available in PATH or at
//     BROWSERSTACK_LOCAL_BINARY. Download: https://www.browserstack.com/local-testing/releases
// ---------------------------------------------------------------------------

let _tunnelStarted = false

function getLocalBinary() {
  return process.env.BROWSERSTACK_LOCAL_BINARY || 'BrowserStackLocal'
}

function getLocalIdentifier() {
  return process.env.BROWSERSTACK_LOCAL_IDENTIFIER || 'maestro-tunnel'
}

function startLocalTunnel(credentials) {
  if (_tunnelStarted) return

  const binary = getLocalBinary()
  const identifier = getLocalIdentifier()

  console.log(`\n[BS] Starting Local tunnel daemon (identifier: ${identifier})...`)

  try {
    execFileSync(
      binary,
      ['--key', credentials.accessKey, '--local-identifier', identifier, '--daemon', 'start'],
      { stdio: 'pipe' }
    )
    _tunnelStarted = true
    console.log('[BS] Local tunnel daemon started\n')
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim() : err.message
    throw new Error(
      `Failed to start BrowserStackLocal daemon: ${msg}\n` +
      `Binary: "${binary}"\n` +
      `Download from: https://www.browserstack.com/local-testing/releases`
    )
  }
}

function stopLocalTunnel(credentials) {
  if (!_tunnelStarted) return

  const binary = getLocalBinary()
  const identifier = getLocalIdentifier()

  console.log('\n[BS] Stopping Local tunnel daemon...')

  try {
    execFileSync(
      binary,
      ['--key', credentials.accessKey, '--local-identifier', identifier, '--daemon', 'stop'],
      { stdio: 'pipe' }
    )
    console.log('[BS] Local tunnel daemon stopped')
  } catch (err) {
    // Log but don't throw — we're in cleanup, don't mask the original error
    const msg = err.stderr ? err.stderr.toString().trim() : err.message
    console.warn(`[BS] Warning: could not stop Local tunnel daemon: ${msg}`)
  } finally {
    _tunnelStarted = false
  }
}

// ---------------------------------------------------------------------------
// High-level entry point — called from gherkin-runner.js
// ---------------------------------------------------------------------------

/**
 * Resolves a flow name to its absolute path, searching:
 *   maestro/flows/, maestro/shared/, maestro/<platform>/
 */
function resolveFlowPath(flowName, platform) {
  const maestroDir = path.resolve(__dirname, '..')
  const candidates = [
    path.join(maestroDir, 'flows', `${flowName}.yml`),
    path.join(maestroDir, 'shared', `${flowName}.yml`),
    path.join(maestroDir, platform, `${flowName}.yml`),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(
    `Flow file not found for "${flowName}". Searched:\n` +
    candidates.map(c => `  ${c}`).join('\n')
  )
}

/**
 * Runs all flows for a single Gherkin scenario on BrowserStack.
 *
 * @param {Array<{ flow: string, params: object }>} flowsToRun
 * @param {{ PLATFORM: string, APP_ID?: string, USERNAME?: string, PASSWORD?: string, [k: string]: string }} env
 * @param {'android'|'ios'} platform
 * @param {object} config
 * @param {string}  config.suiteUrl      Pre-uploaded test suite URL (shared across scenarios)
 * @param {string}  config.appUrl        Pre-uploaded app URL (shared across scenarios)
 * @param {string}  config.device        BrowserStack device string
 * @param {boolean} config.local         Whether to use BrowserStack Local
 * @param {string}  [config.localIdentifier]
 * @param {object}  [config.extraEnv]    Extra env vars from environment config (e.g. MOCK_SERVER_URL)
 * @returns {Promise<{ status: 'passed'|'failed', error: string|null }>}
 */
async function runScenarioOnBrowserStack(flowsToRun, env, platform, config) {
  const credentials = getCredentials()
  const maestroDir = path.resolve(__dirname, '..')

  // Resolve absolute paths and relative paths for the execute field
  const flowAbsPaths = flowsToRun.map(({ flow }) => resolveFlowPath(flow, platform))
  const flowRelPaths = flowAbsPaths.map(f => path.relative(maestroDir, f))

  // Env vars to pass to the flows:
  // - scenario env (USERNAME, PASSWORD, APP_ID, ...)
  // - environment-level extras (MOCK_SERVER_URL, ...)
  // Strip PLATFORM — BrowserStack handles that separately
  const { PLATFORM: _, ...flowEnv } = env
  const buildEnv = { ...flowEnv, ...(config.extraEnv || {}) }

  const buildId = await triggerBuild(
    config.appUrl,
    config.suiteUrl,
    platform,
    config.device,
    flowRelPaths,
    buildEnv,
    { local: config.local, localIdentifier: config.localIdentifier },
    credentials
  )

  const buildResult = await pollBuild(buildId, credentials)
  return parseBuildResult(buildResult, flowRelPaths)
}

// ---------------------------------------------------------------------------
// Environment config
// ---------------------------------------------------------------------------

const ENVIRONMENTS = ['production', 'staging', 'mock']

/**
 * Returns the environment-specific config:
 * - appFile: path to the binary for this environment/platform
 * - needsTunnel: whether BrowserStack Local must be active
 * - extraEnv: extra vars forwarded to Maestro flows (e.g. MOCK_SERVER_URL)
 */
function getEnvironmentConfig(environment, platform) {
  const env = (environment || 'staging').toLowerCase()

  if (!ENVIRONMENTS.includes(env)) {
    throw new Error(
      `Unknown environment "${env}". Valid values: ${ENVIRONMENTS.join(', ')}`
    )
  }

  const platformKey = platform === 'android' ? 'ANDROID' : 'IOS'
  const envKey = env.toUpperCase()

  // App file: try environment-specific var first, fall back to generic
  const appFile =
    process.env[`BROWSERSTACK_${envKey}_${platformKey}_APP_FILE`] ||
    process.env[`BROWSERSTACK_${platformKey}_APP_FILE`] ||
    process.env.BROWSERSTACK_APP_FILE

  // Extra env vars passed to Maestro flows
  const extraEnv = {}
  if (env === 'mock') {
    const mockUrl = process.env.MOCK_SERVER_URL
    if (!mockUrl) {
      throw new Error(
        'MOCK_SERVER_URL env var is required for --environment mock.\n' +
        'Example: "http://localhost:3000"'
      )
    }
    extraEnv.MOCK_SERVER_URL = mockUrl
  }

  return {
    appFile,
    needsTunnel: env === 'staging' || env === 'mock',
    extraEnv,
  }
}

/**
 * Prepares shared resources that are reused across all scenarios in a run:
 * - App upload (cached per binary)
 * - Flow suite upload (one zip for the whole run)
 *
 * Call this once before iterating over scenarios.
 *
 * @param {'android'|'ios'} platform
 * @param {string} environment  'production' | 'staging' | 'mock'
 * @returns {Promise<{ appUrl: string, suiteUrl: string, extraEnv: object, needsTunnel: boolean }>}
 */
async function prepareBrowserStackRun(platform, environment) {
  const credentials = getCredentials()
  const maestroDir = path.resolve(__dirname, '..')
  const envConfig = getEnvironmentConfig(environment, platform)

  console.log(`  [BS] Environment : ${(environment || 'staging').toLowerCase()}`)
  if (envConfig.needsTunnel) {
    console.log(`  [BS] Tunnel      : required`)
  }
  if (Object.keys(envConfig.extraEnv).length > 0) {
    for (const [k, v] of Object.entries(envConfig.extraEnv)) {
      console.log(`  [BS] Flow env    : ${k}=${v}`)
    }
  }

  const [appUrl, suiteUrl] = await Promise.all([
    uploadApp(envConfig.appFile, platform, credentials),
    uploadFlowSuite(maestroDir, credentials),
  ])

  return {
    appUrl,
    suiteUrl,
    extraEnv: envConfig.extraEnv,
    needsTunnel: envConfig.needsTunnel,
  }
}

/**
 * Returns the BrowserStack device string for the given platform.
 */
function getBrowserStackDevice(platform) {
  const device = platform === 'android'
    ? process.env.BROWSERSTACK_ANDROID_DEVICE
    : process.env.BROWSERSTACK_IOS_DEVICE

  if (!device) {
    throw new Error(
      `BROWSERSTACK_${platform.toUpperCase()}_DEVICE env var is required.\n` +
      `Example: "Samsung Galaxy S21-11.0" (Android) or "iPhone 14-16" (iOS)`
    )
  }
  return device
}

module.exports = {
  prepareBrowserStackRun,
  runScenarioOnBrowserStack,
  getBrowserStackDevice,
  startLocalTunnel,
  stopLocalTunnel,
  getCredentials,
}
