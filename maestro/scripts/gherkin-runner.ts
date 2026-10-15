#!/usr/bin/env tsx
import path from 'path'
import fs from 'fs'
import { resolveStep, resolveMaestroFlowFile } from '../step-definitions/index.js'
import { getPickles, getPickleStepTexts, buildFlowsFromSteps, pickleLabel } from './lib/gherkin.js'
import { useCompositeFlows } from './lib/composite-mode.js'
import { DEFAULT_OUT_DIR, writeComposerFromFlows, compositeFlowResults, cleanComposerDir, scenarioComposerStem } from './lib/compose-flows.js'
import { attributeCompositeFlows, findComposerCommandLog, findComposerDebugDir, resolveCompositeFlowResults } from './lib/attribute-composite.js'
import { collectScenarioScreenshot } from './lib/capture-screenshot.js'
import { buildRunSummary, buildStepReports, writeReports } from './lib/write-reports.js'
import { resolveAzurePlanId, resolveAzureSuiteId } from './lib/azure-env.js'
import {
  runScenarioOnBrowserStack,
  prepareBrowserStackRun,
  getBrowserStackDevice,
  startLocalTunnel,
  stopLocalTunnel,
  getCredentials,
} from './browserstack-adapter.js'
import { publishResults as _publishResults, fetchSuiteTestCases } from './publish-results.js'
import { getMaestroBinary, execMaestroSync, appendMaestroEnvArgs, buildMaestroTestArgs, prepareMaestroAndroidBeforeCliRun, prepareMaestroBetweenFlowRuns, isMaestroSessionLockError } from './resolve-maestro-bin.js'
import { formatScenarioHeader, formatGherkinSteps, formatFlowLaunch, formatMaestroCommand, formatFlowResult, formatFeatureHeader, formatSessionPrepNote } from './lib/runner-output.js'
import { resetMaestroOutputSession } from './lib/maestro-output.js'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {} as any
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
    else if (argv[i] === '--per-flow') args.perFlow = true
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
const useCompose = useCompositeFlows({ perFlow: args.perFlow, env: process.env })

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

function maestroTestsDir() {
  const home = process.env.USERPROFILE || process.env.HOME
  return home ? path.join(home, '.maestro', 'tests') : null
}

function captureFailureShot(platform, scenarioName, sinceMs) {
  const reportDir = resolveReportDir()
  if (!reportDir) return null
  return collectScenarioScreenshot({
    platform,
    scenarioName,
    kind: 'error',
    reportDir,
    sinceMs,
    searchDir: maestroTestsDir(),
  })
}

function composerNameForPickle(featurePath, pickleName, index, total) {
  const base = scenarioComposerStem(featurePath, pickleName)
  return total > 1 ? `${base}-${index + 1}` : base
}

function flowsWithRel(flowsToRun, composerPath) {
  const composerDir = path.dirname(composerPath)
  return flowsToRun.map(({ flow, params }) => {
    const abs = resolveMaestroFlowFile(flow)
    const fileRel = abs ? path.relative(composerDir, abs).split(path.sep).join('/') : null
    return { flow, params: params || {}, fileRel }
  })
}

function compositeResultsFromLog(flowsToRun, { passed, composerPath, name, sinceMs }) {
  const withRel = flowsWithRel(flowsToRun, composerPath)
  const searchDir = maestroTestsDir()
  const commands = searchDir ? findComposerCommandLog(searchDir, { name, sinceMs }) : null
  return resolveCompositeFlowResults(withRel, commands, { passed })
}

/** Trust the per-scenario command log. A batched Maestro process exits non-zero if any scenario failed. */
function judgeComposerRun(flowsToRun, composerPath, name, sinceMs) {
  const withRel = flowsWithRel(flowsToRun, composerPath)
  const searchDir = maestroTestsDir()
  const commands = searchDir ? findComposerCommandLog(searchDir, { name, sinceMs }) : null
  if (!commands) {
    return { passed: false, flowResults: compositeFlowResults(withRel, { passed: false }), error: null }
  }
  const attributed = attributeCompositeFlows(withRel, commands)
  if (!attributed) {
    const failed = commands.some(entry => entry && entry.metadata && entry.metadata.status === 'FAILED')
    return {
      passed: !failed,
      flowResults: compositeFlowResults(withRel, { passed: !failed }),
      error: null,
    }
  }
  const fail = attributed.find(row => row.status === 'failed')
  const passed = !fail && attributed.every(row => row.status === 'passed')
  return { passed, flowResults: attributed, error: fail ? fail.error : null }
}

function copyComposerFailureShot(platform, scenarioName, name, sinceMs) {
  const reportDir = resolveReportDir()
  const searchDir = maestroTestsDir()
  const debugDir = searchDir ? findComposerDebugDir(searchDir, { name, sinceMs }) : null
  if (!reportDir || !debugDir) return null
  return collectScenarioScreenshot({
    platform,
    scenarioName,
    kind: 'error',
    reportDir,
    sinceMs,
    searchDir: debugDir,
    skipDeviceCapture: true,
  })
}

function featuresToCompose() {
  if (args.feature) return [path.resolve(args.feature)]
  const dir = args.featureDir
    ? path.resolve(args.featureDir)
    : path.join(__dirname, '..', 'features')
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.feature'))
    .sort()
    .map(f => path.join(dir, f))
}

function writeComposersForRun() {
  cleanComposerDir(DEFAULT_OUT_DIR)
  for (const featurePath of featuresToCompose()) {
    const pickles = getPickles(featurePath)
    const nameCounts = new Map()
    for (const pickle of pickles) {
      nameCounts.set(pickle.name, (nameCounts.get(pickle.name) || 0) + 1)
    }
    const nameIndex = new Map()
    for (const pickle of pickles) {
      const idx = nameIndex.get(pickle.name) || 0
      nameIndex.set(pickle.name, idx + 1)
      let flowsToRun
      try {
        flowsToRun = buildFlowsFromSteps(getPickleStepTexts(pickle), text => resolveStep(text))
      } catch {
        continue
      }
      if (!flowsToRun.length) continue
      const stem = composerNameForPickle(featurePath, pickle.name, idx, nameCounts.get(pickle.name))
      writeComposerFromFlows({
        name: stem,
        flows: flowsToRun.map(({ flow, params }) => ({ flow, params })),
        outDir: DEFAULT_OUT_DIR,
      })
    }
  }
}

function gherkinKeywordFromPickleStep(step) {
  const map = { Context: 'Given', Action: 'When', Outcome: 'Then', Conjunction: 'And' }
  if (step?.type && map[step.type]) return map[step.type]
  return (step?.keyword || 'Step').trim()
}

/** Flows que usan ${APP_NAME} (p. ej. diálogos de permisos). El resto no lo necesita en CLI. */
const FLOWS_USING_APP_NAME = new Set(['AcceptPermissions', 'Login', 'AppLanguage'])

function filterEnvForFlow(flowName, env) {
  const base = String(flowName || '').split('/').pop()
  if (FLOWS_USING_APP_NAME.has(flowName) || FLOWS_USING_APP_NAME.has(base)) return env
  const filtered = { ...env }
  delete filtered.APP_NAME
  return filtered
}

let localMaestroFlowRunCount = 0

async function runMaestroFlowFile(flowFile, env, platform, { flowName, flowFiles } = {} as any) {
  const files = flowFiles && flowFiles.length ? flowFiles : [flowFile]
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(`Flow file not found: ${file}`)
    }
  }
  const label = flowName || (files.length > 1
    ? `${files.length} scenarios`
    : path.basename(files[0], '.yml'))

  const { maestroArgs, cwd } = buildMaestroTestArgs(platform)
  appendMaestroEnvArgs(maestroArgs, env)
  maestroArgs.push(...files)
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
        flowName: label,
        flowFile: files[0],
        platform,
        env,
      }))
      const commandLine = formatMaestroCommand(maestroBin, maestroArgs)
      if (commandLine) process.stdout.write(commandLine)
    }

    try {
      const stdout = await execMaestroSync(maestroArgs, {
        cwd,
        flowFile: files.length === 1 ? files[0] : undefined,
        seedPlan: files.length === 1,
      })
      localMaestroFlowRunCount++
      return stdout
    } catch (err) {
      lastErr = err
      if (err && (err.code === 'ENOENT' || err.errno === -4058)) {
        throw new Error(
          `No se encuentra el ejecutable Maestro (${maestroBin}). ` +
            'Instala Maestro, añádelo al PATH o define MAESTRO_CLI (p. ej. C:\\maestro\\maestro\\bin\\maestro.bat en Windows o $HOME/.maestro/bin/maestro en Unix).'
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

async function runMaestroFlow(flowName, env, platform) {
  const flowFile = resolveMaestroFlowFile(flowName)
  if (!flowFile) {
    throw new Error(`Flow file not found for "${flowName}" (expected under maestro/shared/)`)
  }
  return runMaestroFlowFile(flowFile, filterEnvForFlow(flowName, env), platform, { flowName })
}

// ---------------------------------------------------------------------------
// Run a single feature file, return its results array
// ---------------------------------------------------------------------------

async function runFeature(featurePath, filterScenarioName, platform, appId, bsConfig, batchPlans) {
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
  const repoRoot = path.join(__dirname, '..', '..')
  const featureRel = path.relative(repoRoot, featurePath).replace(/\\/g, '/')
  console.log(formatFeatureHeader(fileName))

  const nameCounts = new Map()
  for (const pickle of pickles) {
    nameCounts.set(pickle.name, (nameCounts.get(pickle.name) || 0) + 1)
  }

  /** @type {Array<object>} */
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
        params: resolved.params || {},
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
      const failedAt = new Date()
      const failed = {
        scenarioName: displayName,
        status: 'failed',
        error: err.message,
        screenshotPath: null,
        featureFile: fileName,
        file: featureRel,
        startedAt: failedAt.toISOString(),
        finishedAt: failedAt.toISOString(),
        durationMs: 0,
        gherkinSteps,
        flows: [],
        steps: buildStepReports(gherkinSteps, []),
        testCaseId: batchPlans ? batchPlans.testCaseId : undefined,
      }
      if (batchPlans) {
        batchPlans.push({ settled: failed })
        continue
      }
      results.push(failed)
      continue
    }

    console.log(formatScenarioHeader(displayName, { featureFile: fileName, platform }))
    process.stdout.write(formatGherkinSteps(gherkinSteps))
    resetMaestroOutputSession()

    /** @type {'passed' | 'failed'} */
    let scenarioStatus = 'passed'
    let scenarioError = null
    let screenshotPath = null
    /** @type {Array<object>} */
    const flowResults = []
    const scenarioStartedMs = Date.now()
    const startedAt = new Date(scenarioStartedMs).toISOString()

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
        const composerStem = composerNameForPickle(
          featurePath,
          pickle.name,
          idx,
          nameCounts.get(pickle.name),
        )
        const result = await runScenarioOnBrowserStack(flowsToRun, scenarioEnv, platform, bsConfig, {
          compositeRelPath: useCompose && flowsToRun.length
            ? `.tmp/scenarios/${composerStem}.yml`
            : null,
        })
        scenarioStatus = result.status
        scenarioError = result.error
        const durationMs = Date.now() - scenarioStartedMs
        for (const { flow, params } of flowsToRun) {
          flowResults.push({
            flow,
            title: flow,
            params: params || {},
            status: scenarioStatus === 'passed' ? 'passed' : 'failed',
            durationMs: null,
            error: scenarioStatus === 'failed' ? scenarioError : null,
          })
        }
        if (result.status === 'passed') {
          console.log(`  Scenario "${displayName}" passed on BrowserStack`)
        } else {
          console.error(`  Scenario "${displayName}" failed on BrowserStack: ${result.error}`)
        }
        const finishedAt = new Date().toISOString()
        results.push({
          scenarioName: displayName,
          status: scenarioStatus,
          error: scenarioError,
          screenshotPath: null,
          featureFile: fileName,
          file: featureRel,
          startedAt,
          finishedAt,
          durationMs,
          gherkinSteps,
          flows: flowResults,
          steps: buildStepReports(gherkinSteps, flowResults),
        })
        continue
      } catch (err) {
        scenarioStatus = 'failed'
        scenarioError = err.message
        console.error(`  BrowserStack error for "${displayName}": ${err.message}`)
        const finishedAt = new Date().toISOString()
        results.push({
          scenarioName: displayName,
          status: scenarioStatus,
          error: scenarioError,
          screenshotPath: null,
          featureFile: fileName,
          file: featureRel,
          startedAt,
          finishedAt,
          durationMs: Date.now() - scenarioStartedMs,
          gherkinSteps,
          flows: flowResults,
          steps: buildStepReports(gherkinSteps, flowResults),
        })
        continue
      }
    } else if (useCompose && flowsToRun.length && batchPlans) {
      const stem = composerNameForPickle(featurePath, pickle.name, idx, nameCounts.get(pickle.name))
      const composerPath = writeComposerFromFlows({
        name: stem,
        flows: flowsToRun.map(({ flow, params }) => ({ flow, params })),
        outDir: DEFAULT_OUT_DIR,
      })
      console.log(`  Compose     : ${composerPath}`)
      batchPlans.push({
        displayName,
        gherkinSteps,
        flowsToRun,
        composerPath,
        stem,
        fileName,
        featureRel,
        scenarioEnv,
        testCaseId: batchPlans.testCaseId,
      })
      continue
    } else if (useCompose && flowsToRun.length) {
      const stem = composerNameForPickle(featurePath, pickle.name, idx, nameCounts.get(pickle.name))
      let composerPath
      try {
        composerPath = writeComposerFromFlows({
          name: stem,
          flows: flowsToRun.map(({ flow, params }) => ({ flow, params })),
          outDir: DEFAULT_OUT_DIR,
        })
        console.log(`  Compose     : ${composerPath}`)
        await runMaestroFlowFile(composerPath, scenarioEnv, platform, { flowName: stem })
        flowResults.push(...compositeResultsFromLog(flowsToRun, {
          passed: true,
          composerPath,
          name: stem,
          sinceMs: scenarioStartedMs,
        }))
        process.stdout.write(formatFlowResult(stem, 'passed'))
      } catch (err) {
        scenarioStatus = 'failed'
        scenarioError = err.message
        screenshotPath = captureFailureShot(platform, displayName, scenarioStartedMs)
        flowResults.push(...(composerPath
          ? compositeResultsFromLog(flowsToRun, {
            passed: false,
            composerPath,
            name: stem,
            sinceMs: scenarioStartedMs,
          })
          : compositeFlowResults(flowsToRun, { passed: false })))
        console.error(`  Composed "${displayName}" failed: ${err.message}`)
      }
    } else {
      for (const { flow: flowName, params: flowParams } of flowsToRun) {
        const env = { ...scenarioEnv, ...flowParams }
        const flowStartedMs = Date.now()

        try {
          await runMaestroFlow(flowName, env, platform)
          flowResults.push({
            flow: flowName,
            title: flowName,
            params: flowParams || {},
            status: 'passed',
            durationMs: Date.now() - flowStartedMs,
            error: null,
          })
          process.stdout.write(formatFlowResult(flowName, 'passed'))
        } catch (err) {
          scenarioStatus = 'failed'
          scenarioError = err.message
          screenshotPath = captureFailureShot(platform, displayName, scenarioStartedMs)
          flowResults.push({
            flow: flowName,
            title: flowName,
            params: flowParams || {},
            status: 'failed',
            durationMs: Date.now() - flowStartedMs,
            error: err.message,
          })
          console.error(`  Flow "${flowName}" failed: ${err.message}`)
          break
        }
      }
    }

    const finishedAt = new Date().toISOString()
    results.push({
      scenarioName: displayName,
      status: scenarioStatus,
      error: scenarioError,
      screenshotPath,
      featureFile: fileName,
      file: featureRel,
      startedAt,
      finishedAt,
      durationMs: Date.now() - scenarioStartedMs,
      gherkinSteps,
      flows: flowResults,
      steps: buildStepReports(gherkinSteps, flowResults),
    })
  }

  return results
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '')
}

function parseMaestroSuiteResults(text) {
  const clean = stripAnsi(text)
  const byName = new Map()
  for (const match of clean.matchAll(/\[(Passed|Failed)\]\s+(.+?)\s+\((\d+)s\)/g)) {
    byName.set(match[2].trim(), {
      passed: match[1] === 'Passed',
      durationMs: Number(match[3]) * 1000,
    })
  }
  const summary = clean.match(/(\d+)\/(\d+)\s+Flows Passed/)
  return {
    byName,
    allPassed: summary ? summary[1] === summary[2] : null,
  }
}

async function finishCompositeBatch(plans, platform) {
  const pending = plans.filter(plan => !plan.settled)
  const startedMs = Date.now()
  let batchError = null
  let suite = { byName: new Map(), allPassed: null }
  if (pending.length) {
    console.log(`\n  Maestro     : ${pending.length} escenario(s) en un solo proceso`)
    try {
      const stdout = await runMaestroFlowFile(pending[0].composerPath, pending[0].scenarioEnv, platform, {
        flowName: `${pending.length} scenarios`,
        flowFiles: pending.map(plan => plan.composerPath),
      })
      suite = parseMaestroSuiteResults(stdout)
    } catch (err) {
      suite = parseMaestroSuiteResults(`${err && err.stdout ? err.stdout : ''}\n${err && err.stderr ? err.stderr : ''}`)
      const reportedFailure = [...suite.byName.values()].some(row => !row.passed)
      if (reportedFailure || suite.allPassed !== true) {
        batchError = err
        console.error(`  Maestro batch finished with failures: ${err.message}`)
      }
    }
  }

  const results = []
  for (const plan of plans) {
    if (plan.settled) {
      results.push(plan.settled)
      continue
    }
    const reported = suite.byName.get(plan.stem)
    const judged = judgeComposerRun(plan.flowsToRun, plan.composerPath, plan.stem, startedMs)
    const passed = reported
      ? reported.passed
      : (suite.allPassed === true ? true : judged.passed)
    const status = passed ? 'passed' : 'failed'
    const error = passed
      ? null
      : (judged.error || (batchError && batchError.message) || 'Maestro exited with code 1')
    const flowMs = judged.flowResults.reduce((sum, row) => (
      sum + (typeof row.durationMs === 'number' ? row.durationMs : 0)
    ), 0)
    const durationMs = (reported && reported.durationMs)
      || (flowMs > 0 ? flowMs : (pending.length === 1 ? Date.now() - startedMs : null))
    const flowResults = passed === judged.passed
      ? judged.flowResults
      : compositeFlowResults(flowsWithRel(plan.flowsToRun, plan.composerPath), { passed })
    const screenshotPath = status === 'failed'
      ? copyComposerFailureShot(platform, plan.displayName, plan.stem, startedMs)
      : null
    if (status === 'passed') process.stdout.write(formatFlowResult(plan.stem, 'passed'))
    else console.error(`  Composed "${plan.displayName}" failed: ${error}`)
    const finishedAt = new Date().toISOString()
    results.push({
      scenarioName: plan.displayName,
      status,
      error,
      screenshotPath,
      testCaseId: plan.testCaseId,
      featureFile: plan.fileName,
      file: plan.featureRel,
      startedAt: new Date(startedMs).toISOString(),
      finishedAt,
      durationMs,
      gherkinSteps: plan.gherkinSteps,
      flows: flowResults,
      steps: buildStepReports(plan.gherkinSteps, flowResults),
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
  const batchPlans: any = (executor === 'local' && useCompose) ? [] : null

  let bsConfig = null
  if (executor === 'browserstack') {
    if (useCompose) writeComposersForRun()

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
        const missing = { scenarioName: String(tc.name), status: /** @type {'failed'} */ ('failed'), error: 'No matching Gherkin scenario found', screenshotPath: null, testCaseId: tc.id }
        if (batchPlans) batchPlans.push({ settled: missing })
        else results.push(missing)
        continue
      }
      if (batchPlans) batchPlans.testCaseId = tc.id
      const tcResults = await runFeature(featurePath, tc.name, platform, appId, bsConfig, batchPlans)
      if (!batchPlans) {
        for (const r of tcResults) r.testCaseId = tc.id
        results.push(...tcResults)
      }
    }
  } else {
    if (args.featureDir) console.log(`  Feature dir: ${path.resolve(args.featureDir)}`)
    else console.log(`  Feature    : ${path.resolve(args.feature)}`)

    for (const featurePath of featurePaths) {
      results.push(...await runFeature(featurePath, undefined, platform, appId, bsConfig, batchPlans))
    }
  }

  if (batchPlans && batchPlans.length) {
    results.push(...await finishCompositeBatch(batchPlans, platform))
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
  console.log(`  Compose     : ${useCompose ? (executor === 'local' ? 'scenario, one process' : 'scenario') : 'per-flow'}`)

  if (useCompose && executor === 'local') cleanComposerDir(DEFAULT_OUT_DIR)

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
      const timing = typeof r.durationMs === 'number' ? ` (${(r.durationMs / 1000).toFixed(1)}s)` : ''
      console.log(`  [${icon}] ${r.scenarioName}${timing}`)
      if (r.error) console.log(`         Error: ${r.error}`)
      if (r.status === 'failed' && r.screenshotPath) {
        console.log(`         Screenshot: ${r.screenshotPath}`)
      }
      if (Array.isArray(r.flows) && r.flows.length > 0) {
        const flowSummary = r.flows
          .map(f => {
            const t = typeof f.durationMs === 'number' ? `${(f.durationMs / 1000).toFixed(1)}s` : '?'
            return `${f.flow}:${f.status}/${t}`
          })
          .join(', ')
        console.log(`         Flows: ${flowSummary}`)
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
      config: {
        executor,
        environment,
        platforms,
      },
    })
    const { jsonPath, xmlPath, htmlPath } = writeReports(summary, reportDir)
    console.log(`\nReports written:`)
    console.log(`  ${jsonPath}`)
    console.log(`  ${xmlPath}`)
    console.log(`  ${htmlPath}`)
    console.log(`  stats: ${summary.stats.expected} passed, ${summary.stats.unexpected} failed, ${(summary.durationMs / 1000).toFixed(1)}s`)
    console.log(`  Open HTML report: ${htmlPath}`)
  }

  process.exit(totalFailed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
