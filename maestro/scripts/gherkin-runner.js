#!/usr/bin/env node

'use strict'

const path = require('path')
const fs = require('fs')
const { resolveStep } = require('../step-definitions/index')
const { getPickles, getPickleStepTexts, buildFlowsFromSteps, pickleLabel } = require('./lib/gherkin')
const { buildRunSummary, writeReports } = require('./lib/write-reports')
const { resolveAzurePlanId, resolveAzureSuiteId } = require('./lib/azure-env')
const { publishResults: _publishResults, fetchSuiteTestCases } = require('./publish-results')
const {
  getMaestroBinary,
  execMaestroSync,
  appendMaestroEnvArgs,
  buildMaestroTestArgs,
  prepareMaestroAndroidBeforeCliRun,
  prepareMaestroBetweenFlowRuns,
  isMaestroSessionLockError,
} = require('./resolve-maestro-bin')
const {
  formatScenarioHeader,
  formatGherkinSteps,
  formatFlowLaunch,
  formatMaestroCommand,
  formatFlowResult,
  formatFeatureHeader,
  formatSessionPrepNote,
} = require('./lib/runner-output')
const { resetMaestroOutputSession } = require('./lib/maestro-output')

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--feature') args.feature = argv[++i]
    else if (argv[i] === '--feature-dir') args.featureDir = argv[++i]
    else if (argv[i] === '--from-suite') args.fromSuite = true
    else if (argv[i] === '--plan-id') args.planId = argv[++i]
    else if (argv[i] === '--suite-id') args.suiteId = argv[++i]
    else if (argv[i] === '--platform') args.platform = argv[++i]
    else if (argv[i] === '--app-id') args.appId = argv[++i]
    else if (argv[i] === '--android-app-id') args.androidAppId = argv[++i]
    else if (argv[i] === '--ios-app-id') args.iosAppId = argv[++i]
    else if (argv[i] === '--username') args.username = argv[++i]
    else if (argv[i] === '--password') args.password = argv[++i]
    else if (argv[i] === '--case-id') args.caseId = argv[++i]
    else if (argv[i] === '--executor') args.executor = argv[++i]
    else if (argv[i] === '--environment') args.environment = argv[++i]
    else if (argv[i] === '--no-publish') args.noPublish = true
    else if (argv[i] === '--no-reports') args.noReports = true
    else if (argv[i] === '--report-dir') args.reportDir = argv[++i]
  }
  return args
}

const REPO_ROOT = path.join(__dirname, '..', '..')

function readTemplateVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8'))
    if (pkg.version) return pkg.version
  } catch {
    /* fall through */
  }
  try {
    return fs.readFileSync(path.join(REPO_ROOT, 'VERSION'), 'utf-8').trim()
  } catch {
    return '0.0.0'
  }
}

function resolveReportDir() {
  if (args.noReports) return null
  const configured = args.reportDir || process.env.REPORT_DIR || 'reports'
  return path.isAbsolute(configured) ? configured : path.join(REPO_ROOT, configured)
}

const args = parseArgs(process.argv)

if (!args.feature && !args.featureDir && !args.fromSuite) {
  console.error('Error: --feature <path>, --feature-dir <dir>, or --from-suite is required')
  process.exit(1)
}
if (args.feature && args.featureDir) {
  console.error('Error: --feature and --feature-dir are mutually exclusive')
  process.exit(1)
}
if (!args.platform) {
  console.error('Error: --platform <android|ios|all> is required')
  process.exit(1)
}

const VALID_EXECUTORS = ['local', 'browserstack']
const executor = args.executor || 'local'
if (!VALID_EXECUTORS.includes(executor)) {
  console.error(`Error: unknown executor "${executor}". Valid values: ${VALID_EXECUTORS.join(', ')}`)
  process.exit(1)
}

const VALID_ENVIRONMENTS = ['production', 'staging', 'mock']
const environment = args.environment || 'staging'
if (!VALID_ENVIRONMENTS.includes(environment)) {
  console.error(`Error: unknown environment "${environment}". Valid values: ${VALID_ENVIRONMENTS.join(', ')}`)
  process.exit(1)
}

const VALID_PLATFORMS = ['android', 'ios']

function parsePlatforms(platformArg) {
  if (platformArg === 'all') return ['android', 'ios']
  const list = platformArg.split(',').map(p => p.trim())
  const invalid = list.filter(p => !VALID_PLATFORMS.includes(p))
  if (invalid.length) {
    console.error(`Error: unknown platform(s): ${invalid.join(', ')}. Valid values: android, ios, all`)
    process.exit(1)
  }
  return list
}

const platforms = parsePlatforms(args.platform)

function getAppId(platform) {
  if (args.appId) return args.appId
  if (platform === 'android') return args.androidAppId || process.env.ANDROID_APP_ID || ''
  return args.iosAppId || process.env.IOS_APP_ID || ''
}

function getAppName(platform) {
  if (platform === 'android') return process.env.ANDROID_APP_NAME || process.env.APP_NAME || ''
  return process.env.IOS_APP_NAME || process.env.APP_NAME || ''
}

function requireAppId(platform) {
  const id = getAppId(platform)
  if (!id) {
    console.error(`Error: bundle ID is required for platform "${platform}". Pass --app-id <bundle-id> or set ${platform === 'android' ? 'ANDROID_APP_ID' : 'IOS_APP_ID'} in .env.`)
    process.exit(1)
  }
  return id
}

function resolveFeaturePaths() {
  if (args.featureDir) {
    const dir = path.resolve(args.featureDir)
    if (!fs.existsSync(dir)) {
      console.error(`Error: Feature directory not found: ${dir}`)
      process.exit(1)
    }
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.feature'))
      .sort()
      .map(f => path.join(dir, f))
  }
  const p = path.resolve(args.feature)
  if (!fs.existsSync(p)) {
    console.error(`Error: Feature file not found: ${p}`)
    process.exit(1)
  }
  return [p]
}

const featurePaths = args.fromSuite ? [] : resolveFeaturePaths()

// ---------------------------------------------------------------------------
// Screenshot helper — finds most recent file under ~/.maestro/tests/
// ---------------------------------------------------------------------------

function findLatestScreenshot() {
  const home = process.env.USERPROFILE || process.env.HOME
  if (!home) return null
  const maestroTestsDir = path.join(home, '.maestro', 'tests')
  if (!fs.existsSync(maestroTestsDir)) return null

  let latest = null
  let latestMtime = 0

  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && /\.(png|jpg|jpeg)$/i.test(entry.name)) {
        const { mtimeMs } = fs.statSync(full)
        if (mtimeMs > latestMtime) {
          latestMtime = mtimeMs
          latest = full
        }
      }
    }
  }

  walk(maestroTestsDir)
  return latest
}

function gherkinKeywordFromPickleStep(step) {
  const map = { Context: 'Given', Action: 'When', Outcome: 'Then', Conjunction: 'And' }
  if (step?.type && map[step.type]) return map[step.type]
  return (step?.keyword || 'Step').trim()
}

/** Flows que usan ${APP_NAME} (p. ej. diálogos de permisos). El resto no lo necesita en CLI. */
const FLOWS_USING_APP_NAME = new Set(['AcceptPermissions', 'Login', 'AppLanguage'])

function filterEnvForFlow(flowName, env) {
  if (FLOWS_USING_APP_NAME.has(flowName)) return env
  const filtered = { ...env }
  delete filtered.APP_NAME
  return filtered
}

function resolveMaestroFlowPath(flowName) {
  const flowsPath = path.resolve(path.join(__dirname, '..', 'flows', `${flowName}.yml`))
  if (fs.existsSync(flowsPath)) return flowsPath
  const sharedPath = path.resolve(path.join(__dirname, '..', 'shared', `${flowName}.yml`))
  if (fs.existsSync(sharedPath)) return sharedPath
  return flowsPath
}

let localMaestroFlowRunCount = 0

async function runMaestroFlow(flowName, env, platform) {
  const flowFile = resolveMaestroFlowPath(flowName)

  if (!fs.existsSync(flowFile)) {
    throw new Error(`Flow file not found: ${flowFile}`)
  }

  const { maestroArgs, cwd } = buildMaestroTestArgs(platform)
  appendMaestroEnvArgs(maestroArgs, filterEnvForFlow(flowName, env))
  maestroArgs.push(flowFile)
  const maestroBin = getMaestroBinary()

  const maxAttempts = Number(process.env.MAESTRO_RUN_RETRIES || 3)
  let lastErr = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let sessionCleared = false
    if (attempt > 1) {
      console.warn(`  [maestro] Reintento ${attempt}/${maxAttempts} tras bloqueo de sesión...`)
      const prep = await prepareMaestroBetweenFlowRuns({ forceDelay: true })
      sessionCleared = prep.sessionCleared
    } else if (localMaestroFlowRunCount > 0 && executor === 'local') {
      const prep = await prepareMaestroBetweenFlowRuns()
      sessionCleared = prep.sessionCleared
    }

    if (attempt === 1 || sessionCleared) {
      if (sessionCleared) process.stdout.write(formatSessionPrepNote())
      process.stdout.write(formatFlowLaunch({
        flowName,
        flowFile,
        platform,
        env: filterEnvForFlow(flowName, env),
      }))
      const commandLine = formatMaestroCommand(maestroBin, maestroArgs)
      if (commandLine) process.stdout.write(commandLine)
    }

    try {
      await execMaestroSync(maestroArgs, { cwd, flowFile })
      localMaestroFlowRunCount++
      return
    } catch (err) {
      lastErr = err
      if (err && (err.code === 'ENOENT' || err.errno === -4058)) {
        throw new Error(
          `No se encuentra el ejecutable Maestro (${maestroBin}). ` +
            'Instala Maestro, añádelo al PATH o define MAESTRO_CLI (p. ej. $HOME/.maestro/bin/maestro).'
        )
      }
      const canRetry = attempt < maxAttempts
        && executor === 'local'
        && isMaestroSessionLockError(err)
      if (!canRetry) break
    }
  }

  throw lastErr
}

// ---------------------------------------------------------------------------
// Run a single feature file, return its results array
// ---------------------------------------------------------------------------

async function runFeature(featurePath, filterScenarioName, platform, appId, bsConfig) {
  let pickles
  try {
    pickles = getPickles(featurePath)
  } catch (err) {
    console.error(`Parse error in ${featurePath}: ${err.message}`)
    return []
  }

  if (pickles.length === 0) {
    console.error(`No executable scenarios found in: ${featurePath}`)
    return []
  }

  const fileName = path.basename(featurePath)
  console.log(formatFeatureHeader(fileName))

  const nameCounts = new Map()
  for (const pickle of pickles) {
    nameCounts.set(pickle.name, (nameCounts.get(pickle.name) || 0) + 1)
  }

  /** @type {{ scenarioName: string, status: 'passed' | 'failed', error: string | null, screenshotPath: string | null, testCaseId?: string | number }[]} */
  const results = []

  const nameIndex = new Map()

  for (const pickle of pickles) {
    if (filterScenarioName && pickle.name !== filterScenarioName) continue

    const idx = nameIndex.get(pickle.name) || 0
    nameIndex.set(pickle.name, idx + 1)
    const displayName = pickleLabel(pickle, idx, nameCounts.get(pickle.name))

    const stepTexts = getPickleStepTexts(pickle)
    const gherkinSteps = (pickle.steps || []).map(step => {
      const resolved = resolveStep(step.text)
      return {
        keyword: gherkinKeywordFromPickleStep(step),
        text: step.text,
        flow: resolved.flow,
      }
    })

    let flowsToRun
    try {
      flowsToRun = buildFlowsFromSteps(stepTexts, (text) => {
        const resolved = resolveStep(text)
        if (!resolved.flow) {
          console.debug(`  [debug] Step skipped (flow: null): "${text}"`)
        }
        return resolved
      })
    } catch (err) {
      console.error(`  Step error: ${err.message}`)
      results.push({
        scenarioName: displayName,
        status: 'failed',
        error: err.message,
        screenshotPath: null,
      })
      continue
    }

    console.log(formatScenarioHeader(displayName, { featureFile: fileName, platform }))
    process.stdout.write(formatGherkinSteps(gherkinSteps))
    resetMaestroOutputSession()

    /** @type {'passed' | 'failed'} */
    let scenarioStatus = 'passed'
    let scenarioError = null
    let screenshotPath = null

    const appName = getAppName(platform)
    const scenarioEnv = {
      PLATFORM: platform,
      ...(appId ? { APP_ID: appId } : {}),
      ...(appName ? { APP_NAME: appName } : {}),
      ...(args.username ? { USERNAME: args.username } : {}),
      ...(args.password ? { PASSWORD: args.password } : {}),
      ...(process.env.MOCK_SERVER_URL ? { MOCK_SERVER_URL: process.env.MOCK_SERVER_URL } : {}),
    }

    if (executor === 'browserstack') {
      try {
        const { runScenarioOnBrowserStack } = require('./browserstack-adapter')
        const result = await runScenarioOnBrowserStack(flowsToRun, scenarioEnv, platform, bsConfig)
        scenarioStatus = result.status
        scenarioError = result.error
        if (result.status === 'passed') {
          console.log(`  Scenario "${displayName}" passed on BrowserStack`)
        } else {
          console.error(`  Scenario "${displayName}" failed on BrowserStack: ${result.error}`)
        }
      } catch (err) {
        scenarioStatus = 'failed'
        scenarioError = err.message
        console.error(`  BrowserStack error for "${displayName}": ${err.message}`)
      }
    } else {
      for (const { flow: flowName, params: flowParams } of flowsToRun) {
        const env = { ...scenarioEnv, ...flowParams }

        try {
          await runMaestroFlow(flowName, env, platform)
          process.stdout.write(formatFlowResult(flowName, 'passed'))
        } catch (err) {
          scenarioStatus = 'failed'
          scenarioError = err.message
          screenshotPath = findLatestScreenshot()
          console.error(`  Flow "${flowName}" failed: ${err.message}`)
          break
        }
      }
    }

    results.push({
      scenarioName: displayName,
      status: scenarioStatus,
      error: scenarioError,
      screenshotPath,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Build an index of all scenarios across all feature files
// Returns: Map<scenarioName, featurePath>
// ---------------------------------------------------------------------------

function buildScenarioIndex(featuresDir) {
  const dir = path.resolve(featuresDir)
  const index = new Map()
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.feature'))
  for (const file of files) {
    const filePath = path.join(dir, file)
    try {
      for (const pickle of getPickles(filePath)) {
        index.set(pickle.name, filePath)
      }
    } catch {
      // skip unparseable files
    }
  }
  return index
}

// ---------------------------------------------------------------------------
// Run all scenarios for one platform, return results
// ---------------------------------------------------------------------------

async function runPlatform(platform, planId, suiteId) {
  const appId = requireAppId(platform)

  if (platform === 'android' && executor === 'local') {
    prepareMaestroAndroidBeforeCliRun()
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`  Platform    : ${platform}`)
  console.log(`  Executor    : ${executor}`)
  console.log(`  Environment : ${environment}`)
  console.log(`  App ID      : ${appId || '(not set)'}`)

  /** @type {{ scenarioName: string, status: 'passed' | 'failed', error: string | null, screenshotPath: string | null, testCaseId?: string | number }[]} */
  const results = []

  let bsConfig = null
  if (executor === 'browserstack') {
    const {
      prepareBrowserStackRun,
      getBrowserStackDevice,
    } = require('./browserstack-adapter')

    console.log(`\n  Preparing BrowserStack resources for ${platform} / ${environment}...`)
    const { appUrl, suiteUrl, extraEnv, needsTunnel } = await prepareBrowserStackRun(platform, environment)
    bsConfig = {
      appUrl,
      suiteUrl,
      extraEnv,
      device: getBrowserStackDevice(platform),
      local: needsTunnel,
      localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER || 'maestro-tunnel',
    }
    console.log(`  Device      : ${bsConfig.device}`)
    console.log(`  Tunnel      : ${bsConfig.local}\n`)
  }

  if (args.fromSuite) {
    console.log(`  Mode       : from-suite`)
    console.log(`  Plan ID    : ${planId}`)
    console.log(`  Suite ID   : ${suiteId}`)

    const testCases = await fetchSuiteTestCases(planId, suiteId)
    console.log(`  Test cases : ${testCases.length} found\n`)

    const defaultFeaturesDir = path.join(__dirname, '..', 'features')
    const scenarioIndex = buildScenarioIndex(args.featureDir || defaultFeaturesDir)

    for (const tc of testCases) {
      const featurePath = scenarioIndex.get(tc.name)
      if (!featurePath) {
        console.warn(`  [SKIP] No scenario found for test case: "${tc.name}"`)
        results.push({ scenarioName: String(tc.name), status: /** @type {'failed'} */ ('failed'), error: 'No matching Gherkin scenario found', screenshotPath: null, testCaseId: tc.id })
        continue
      }
      const tcResults = await runFeature(featurePath, tc.name, platform, appId, bsConfig)
      for (const r of tcResults) r.testCaseId = tc.id
      results.push(...tcResults)
    }
  } else {
    if (args.featureDir) console.log(`  Feature dir: ${path.resolve(args.featureDir)}`)
    else console.log(`  Feature    : ${path.resolve(args.feature)}`)

    for (const featurePath of featurePaths) {
      results.push(...await runFeature(featurePath, undefined, platform, appId, bsConfig))
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function run() {
  const startedAt = new Date().toISOString()
  const planId = resolveAzurePlanId(args)
  const suiteId = resolveAzureSuiteId(args)

  console.log(`\nGherkin Runner`)
  console.log(`  Executor    : ${executor}`)
  console.log(`  Environment : ${environment}`)
  console.log(`  Platforms   : ${platforms.join(', ')}`)

  if (args.fromSuite) {
    if (!planId) { console.error('Error: --plan-id, AZURE_TEST_PLAN_ID or PLAN_ID is required with --from-suite'); process.exit(1) }
    if (!suiteId) { console.error('Error: --suite-id, AZURE_TEST_SUITE_ID or SUITE_ID is required with --from-suite'); process.exit(1) }
  }

  const pat = process.env.AZURE_DEVOPS_PAT
  const publishResults = (!args.noPublish && pat && planId) ? _publishResults : undefined

  if (!args.noPublish && !publishResults) {
    const reason = !pat ? 'AZURE_DEVOPS_PAT is not set' : 'AZURE_TEST_PLAN_ID (or PLAN_ID) / --plan-id is not set'
    console.warn(`Warning: ${reason} — results will NOT be published to Azure Test Plans.`)
  }

  const needsTunnel = executor === 'browserstack' && (environment === 'staging' || environment === 'mock')
  if (needsTunnel) {
    const { startLocalTunnel, getCredentials } = require('./browserstack-adapter')
    startLocalTunnel(getCredentials())
  }

  /** @type {{ platform: string, results: Array }[]} */
  const perPlatform = []

  try {
    for (const platform of platforms) {
      const results = await runPlatform(platform, planId, suiteId)
      perPlatform.push({ platform, results })

      // Publish per platform immediately after each run
      if (publishResults) {
        try {
          await publishResults(results, { planId, suiteId, caseId: args.caseId })
        } catch (err) {
          console.warn(`Warning: Failed to publish ${platform} results to Azure Test Plans: ${err.message}`)
        }
      }
    }
  } finally {
    if (needsTunnel) {
      const { stopLocalTunnel, getCredentials } = require('./browserstack-adapter')
      stopLocalTunnel(getCredentials())
    }
  }

  // ---------------------------------------------------------------------------
  // Combined summary
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(60))
  console.log('--- Summary ---')
  let totalFailed = 0
  for (const { platform, results } of perPlatform) {
    console.log(`\n[${platform.toUpperCase()}]`)
    for (const r of results) {
      const icon = r.status === 'passed' ? 'PASS' : 'FAIL'
      if (r.status === 'failed') totalFailed++
      console.log(`  [${icon}] ${r.scenarioName}`)
      if (r.error) console.log(`         Error: ${r.error}`)
      if (r.status === 'failed' && r.screenshotPath) {
        console.log(`         Screenshot: ${r.screenshotPath}`)
      }
    }
  }

  if (!publishResults) {
    const reason = args.noPublish ? '--no-publish flag set' : 'AZURE_DEVOPS_PAT and/or AZURE_TEST_PLAN_ID (or PLAN_ID) not set'
    console.log(`\nNote: ${reason} — skipping Azure Test Plans publishing.`)
  }

  const reportDir = resolveReportDir()
  if (reportDir) {
    const finishedAt = new Date().toISOString()
    const summary = buildRunSummary({
      startedAt,
      finishedAt,
      perPlatform,
      version: readTemplateVersion(),
    })
    const { jsonPath, xmlPath } = writeReports(summary, reportDir)
    console.log(`\nReports written:`)
    console.log(`  ${jsonPath}`)
    console.log(`  ${xmlPath}`)
  }

  process.exit(totalFailed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
