'use strict'

/**
 * Map the template's internal run summary to a Playwright JSONReport-shaped object,
 * and helpers to read scenario rows back from that file (CI scripts).
 *
 * @see https://github.com/microsoft/playwright/blob/main/packages/playwright/types/testReporter.d.ts
 */

const path = require('path')

const TEMPLATE_NAME = 'izertis-maestro-template'

function stableId(...parts) {
  return parts
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join('::')
    .replace(/\s+/g, ' ')
}

function mapStepToPw(step) {
  const out = {
    title: step.title || [step.keyword, step.text].filter(Boolean).join(' ').trim() || 'step',
    duration: typeof step.durationMs === 'number' ? step.durationMs : 0,
  }
  if (step.error) {
    out.error = { message: String(step.error) }
  }
  return out
}

function mapAttachments(result) {
  const attachments = Array.isArray(result.attachments) ? result.attachments : []
  return attachments.map((a) => ({
    name: a.name || 'attachment',
    contentType: a.contentType || 'application/octet-stream',
    path: a.path,
  }))
}

/**
 * @param {object} internal — output of buildRunSummary()
 * @returns {object} Playwright JSONReport-compatible object
 */
function toPlaywrightReport(internal) {
  const platforms = internal.platforms || []
  const platformNames = platforms.map((p) => p.name)
  const executor = internal.config?.executor || 'local'
  const environment = internal.config?.environment || 'staging'
  const version = internal.version || '0.0.0'

  const projects = (platformNames.length ? platformNames : ['default']).map((name) => ({
    outputDir: '',
    repeatEach: 1,
    retries: 0,
    metadata: {
      template: TEMPLATE_NAME,
      version,
      executor,
      environment,
    },
    id: name,
    name,
    testDir: '',
    testIgnore: [],
    testMatch: [],
    timeout: 0,
  }))

  /** @type {Map<string, { title: string, file: string, specs: Map<string, object> }>} */
  const suiteMap = new Map()

  for (const platform of platforms) {
    for (const result of platform.results || []) {
      const file = result.file || (result.featureFile ? `maestro/features/${result.featureFile}` : 'unknown.feature')
      const suiteKey = file
      if (!suiteMap.has(suiteKey)) {
        suiteMap.set(suiteKey, {
          title: path.basename(file, path.extname(file)) || file,
          file,
          specs: new Map(),
        })
      }
      const suite = suiteMap.get(suiteKey)
      const title = result.title || result.scenario || 'scenario'
      const specKey = `${title}::${file}`
      if (!suite.specs.has(specKey)) {
        suite.specs.set(specKey, {
          title,
          ok: true,
          tags: [],
          tests: [],
          id: stableId(file, title),
          file,
          line: 0,
          column: 0,
        })
      }
      const spec = suite.specs.get(specKey)
      const passed = result.status === 'passed'
      if (!passed) spec.ok = false

      const errors = Array.isArray(result.errors) && result.errors.length
        ? result.errors.map((e) => ({ message: e.message || String(e) }))
        : result.error
          ? [{ message: String(result.error) }]
          : []

      const pwResult = {
        workerIndex: 0,
        parallelIndex: 0,
        status: passed ? 'passed' : 'failed',
        duration: typeof result.durationMs === 'number' ? result.durationMs : 0,
        error: errors[0],
        errors,
        stdout: [],
        stderr: [],
        retry: 0,
        startTime: result.startedAt || internal.stats?.startTime || internal.startedAt || new Date().toISOString(),
        attachments: mapAttachments(result),
        annotations: [
          { type: 'maestro.featureFile', description: result.featureFile || path.basename(file) },
          { type: 'maestro.flows', description: JSON.stringify(result.flows || []) },
        ],
        steps: (result.steps || []).map(mapStepToPw),
      }

      spec.tests.push({
        timeout: 0,
        annotations: pwResult.annotations,
        expectedStatus: 'passed',
        projectName: platform.name,
        projectId: platform.name,
        results: [pwResult],
        status: passed ? 'expected' : 'unexpected',
      })
    }
  }

  const suites = [...suiteMap.values()].map((s) => ({
    title: s.title,
    file: s.file,
    column: 0,
    line: 0,
    specs: [...s.specs.values()],
  }))

  return {
    config: {
      configFile: null,
      rootDir: '',
      forbidOnly: false,
      fullyParallel: false,
      globalSetup: null,
      globalTeardown: null,
      globalTimeout: 0,
      grep: {},
      grepInvert: null,
      maxFailures: 0,
      metadata: {
        template: TEMPLATE_NAME,
        version,
        executor,
        environment,
      },
      preserveOutput: 'always',
      reporter: [['json']],
      reportSlowTests: null,
      quiet: false,
      projects,
      shard: null,
      updateSnapshots: 'missing',
      version,
      workers: 1,
      webServer: null,
    },
    suites,
    errors: [],
    stats: {
      startTime: internal.stats?.startTime || internal.startedAt,
      duration: internal.stats?.duration ?? internal.durationMs ?? 0,
      expected: internal.stats?.expected ?? internal.passed ?? 0,
      unexpected: internal.stats?.unexpected ?? internal.failed ?? 0,
      flaky: internal.stats?.flaky ?? 0,
      skipped: internal.stats?.skipped ?? 0,
    },
  }
}

/**
 * Flatten Playwright JSONReport into scenario rows for CI markdown / triage.
 * Also accepts legacy internal summary ({ platforms: [...] }) for back-compat.
 *
 * @param {object} report
 * @returns {Array<object>}
 */
function listScenarioResults(report) {
  if (!report || typeof report !== 'object') return []

  // Legacy internal shape
  if (Array.isArray(report.platforms)) {
    const rows = []
    for (const platform of report.platforms) {
      for (const r of platform.results || []) {
        rows.push({
          platform: platform.name,
          title: r.title || r.scenario,
          scenario: r.scenario || r.title,
          status: r.status,
          durationMs: r.durationMs,
          error: r.error || r.errors?.[0]?.message || null,
          featureFile: r.featureFile || null,
          file: r.file || null,
          flows: r.flows || [],
          steps: r.steps || [],
          attachments: r.attachments || [],
          screenshotPath: r.screenshotPath || null,
        })
      }
    }
    return rows
  }

  const rows = []
  const walkSuites = (suites) => {
    for (const suite of suites || []) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const result = (test.results || [])[(test.results || []).length - 1] || {}
          const annotations = test.annotations || result.annotations || []
          const featureAnn = annotations.find((a) => a.type === 'maestro.featureFile')
          const flowsAnn = annotations.find((a) => a.type === 'maestro.flows')
          let flows = []
          if (flowsAnn?.description) {
            try {
              flows = JSON.parse(flowsAnn.description)
            } catch {
              flows = []
            }
          }
          const status = test.status === 'skipped' || result.status === 'skipped'
            ? 'skipped'
            : (result.status === 'passed' || test.status === 'expected' ? 'passed' : 'failed')
          rows.push({
            platform: test.projectName || test.projectId || '—',
            title: spec.title,
            scenario: spec.title,
            status,
            durationMs: result.duration,
            error: result.error?.message || result.errors?.[0]?.message || null,
            featureFile: featureAnn?.description || path.basename(spec.file || suite.file || ''),
            file: spec.file || suite.file || null,
            flows,
            steps: result.steps || [],
            attachments: result.attachments || [],
            screenshotPath: (result.attachments || []).find((a) => a.name === 'screenshot')?.path || null,
          })
        }
      }
      if (suite.suites?.length) walkSuites(suite.suites)
    }
  }
  walkSuites(report.suites)
  return rows
}

module.exports = {
  toPlaywrightReport,
  listScenarioResults,
  stableId,
}
