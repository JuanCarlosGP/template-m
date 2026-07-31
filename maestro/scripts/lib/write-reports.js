'use strict'

const fs = require('fs')
const path = require('path')

const TEMPLATE_NAME = 'izertis-maestro-template'

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paramsEqual(a = {}, b = {}) {
  const keysA = Object.keys(a).sort()
  const keysB = Object.keys(b).sort()
  if (keysA.length !== keysB.length) return false
  return keysA.every((k, i) => keysB[i] === k && String(a[k]) === String(b[k]))
}

/**
 * Map Gherkin steps to execution status using ordered flow results.
 * Null-flow steps → skipped. Deduped flows → skipped after first match.
 */
function buildStepReports(gherkinSteps = [], flowResults = []) {
  const remaining = flowResults.map(fr => ({ ...fr }))
  let sawFailure = false
  const steps = []

  for (const step of gherkinSteps) {
    const keyword = step.keyword || 'Step'
    const text = step.text || ''
    const flow = step.flow ?? null
    const params = step.params || {}
    const title = `${keyword} ${text}`.trim()

    if (!flow) {
      steps.push({
        title,
        category: 'gherkin',
        keyword,
        text,
        flow: null,
        params: {},
        status: 'skipped',
        durationMs: 0,
        error: null,
      })
      continue
    }

    if (sawFailure) {
      steps.push({
        title,
        category: 'gherkin',
        keyword,
        text,
        flow,
        params,
        status: 'interrupted',
        durationMs: 0,
        error: null,
      })
      continue
    }

    const idx = remaining.findIndex(fr => fr.flow === flow && paramsEqual(fr.params || {}, params))
    if (idx === -1) {
      steps.push({
        title,
        category: 'gherkin',
        keyword,
        text,
        flow,
        params,
        status: 'skipped',
        durationMs: 0,
        error: null,
        note: 'deduplicated',
      })
      continue
    }

    const fr = remaining.splice(idx, 1)[0]
    if (fr.status === 'failed') sawFailure = true
    steps.push({
      title,
      category: 'gherkin',
      keyword,
      text,
      flow,
      params,
      status: fr.status,
      durationMs: fr.durationMs ?? 0,
      error: fr.error || null,
    })
  }

  return steps
}

function msToSeconds(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return undefined
  return Math.round((Number(ms) / 1000) * 1000) / 1000
}

function buildAttachments(result) {
  const attachments = Array.isArray(result.attachments) ? [...result.attachments] : []
  if (result.screenshotPath) {
    const already = attachments.some(a => a.path === result.screenshotPath)
    if (!already) {
      attachments.push({
        name: 'screenshot',
        contentType: 'image/png',
        path: result.screenshotPath,
      })
    }
  }
  return attachments
}

function mapScenarioResult(r) {
  const status = r.status
  const durationMs = r.durationMs ?? null
  const errors = []
  if (r.error) {
    errors.push({ message: r.error })
  }

  const flows = (r.flows || []).map(fr => ({
    title: fr.title || fr.flow,
    category: 'flow',
    flow: fr.flow,
    params: fr.params || {},
    status: fr.status,
    durationMs: fr.durationMs ?? null,
    error: fr.error || null,
  }))

  const steps = Array.isArray(r.steps) && r.steps.length > 0
    ? r.steps
    : buildStepReports(r.gherkinSteps || [], r.flows || [])

  return {
    // Playwright-like
    title: r.scenarioName,
    ok: status === 'passed',
    status,
    durationMs,
    startedAt: r.startedAt || null,
    finishedAt: r.finishedAt || null,
    // Back-compat + extras
    scenario: r.scenarioName,
    featureFile: r.featureFile || null,
    file: r.file || null,
    error: r.error || null,
    errors,
    screenshotPath: r.screenshotPath || null,
    attachments: buildAttachments(r),
    testCaseId: r.testCaseId ?? null,
    steps,
    flows,
  }
}

function buildPlatformStats(results) {
  let expected = 0
  let unexpected = 0
  let duration = 0
  for (const r of results) {
    if (r.status === 'passed') expected++
    else unexpected++
    if (typeof r.durationMs === 'number') duration += r.durationMs
  }
  return {
    expected,
    unexpected,
    flaky: 0,
    skipped: 0,
    duration,
    passed: expected,
    failed: unexpected,
  }
}

function buildRunSummary({ startedAt, finishedAt, perPlatform, version, config }) {
  let passed = 0
  let failed = 0
  let durationMs = 0

  const platforms = perPlatform.map(({ platform, results }) => {
    const mapped = results.map(r => {
      if (r.status === 'passed') passed++
      else failed++
      const mappedResult = mapScenarioResult(r)
      if (typeof mappedResult.durationMs === 'number') durationMs += mappedResult.durationMs
      return mappedResult
    })
    const stats = buildPlatformStats(mapped)
    return {
      name: platform,
      stats,
      results: mapped,
    }
  })

  const wallClockMs = startedAt && finishedAt
    ? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime())
    : durationMs

  return {
    template: TEMPLATE_NAME,
    version: version || '0.0.0',
    config: {
      executor: config?.executor || 'local',
      environment: config?.environment || 'staging',
      platforms: config?.platforms || platforms.map(p => p.name),
    },
    // Playwright-like stats block
    stats: {
      startTime: startedAt,
      duration: wallClockMs,
      expected: passed,
      unexpected: failed,
      flaky: 0,
      skipped: 0,
    },
    // Back-compat top-level fields
    startedAt,
    finishedAt,
    durationMs: wallClockMs,
    passed,
    failed,
    platforms,
  }
}

function buildJUnitXml(summary) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>']
  const totalTests = summary.passed + summary.failed
  const totalTime = msToSeconds(summary.durationMs ?? summary.stats?.duration)
  const suitesAttrs = [
    `tests="${totalTests}"`,
    `failures="${summary.failed}"`,
    `errors="0"`,
  ]
  if (totalTime != null) suitesAttrs.push(`time="${totalTime}"`)
  lines.push(`<testsuites ${suitesAttrs.join(' ')}>`)

  for (const platform of summary.platforms) {
    const failures = platform.results.filter(r => r.status === 'failed').length
    const tests = platform.results.length
    const suiteTime = msToSeconds(platform.stats?.duration)
    const suiteAttrs = [
      `name="${escapeXml(platform.name)}"`,
      `tests="${tests}"`,
      `failures="${failures}"`,
      `errors="0"`,
    ]
    if (suiteTime != null) suiteAttrs.push(`time="${suiteTime}"`)
    lines.push(`<testsuite ${suiteAttrs.join(' ')}>`)

    for (const result of platform.results) {
      const name = escapeXml(result.scenario || result.title)
      const classname = escapeXml(result.featureFile || result.file || platform.name)
      const caseTime = msToSeconds(result.durationMs)
      const caseAttrs = [`classname="${classname}"`, `name="${name}"`]
      if (caseTime != null) caseAttrs.push(`time="${caseTime}"`)

      if (result.status === 'failed') {
        const message = escapeXml(result.error || 'Test failed')
        lines.push(`  <testcase ${caseAttrs.join(' ')}>`)
        lines.push(`    <failure message="${message}">${message}</failure>`)
        lines.push('  </testcase>')
      } else {
        lines.push(`  <testcase ${caseAttrs.join(' ')}/>`)
      }
    }
    lines.push('</testsuite>')
  }

  lines.push('</testsuites>')
  return lines.join('\n')
}

function renderHtmlReport(summary) {
  const templatePath = path.join(__dirname, '..', 'report-viewer', 'template.html')
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Report viewer template not found: ${templatePath}`)
  }
  const template = fs.readFileSync(templatePath, 'utf-8')
  // Embed internal summary shape so template.html / viewer stay unchanged.
  const payload = JSON.stringify(summary).replace(/</g, '\\u003c')
  if (!template.includes('%%MAESTRO_REPORT_JSON%%')) {
    throw new Error('Report viewer template is missing %%MAESTRO_REPORT_JSON%% placeholder')
  }
  return template.replace('%%MAESTRO_REPORT_JSON%%', payload)
}

function writeReports(summary, reportDir) {
  const { toPlaywrightReport } = require('./playwright-report')
  fs.mkdirSync(reportDir, { recursive: true })
  const jsonPath = path.join(reportDir, 'summary.json')
  const xmlPath = path.join(reportDir, 'junit.xml')
  const htmlPath = path.join(reportDir, 'index.html')
  // On-disk summary.json is Playwright JSONReport; HTML embed stays internal.
  const playwrightJson = toPlaywrightReport(summary)
  fs.writeFileSync(jsonPath, JSON.stringify(playwrightJson, null, 2), 'utf-8')
  fs.writeFileSync(xmlPath, buildJUnitXml(summary), 'utf-8')
  fs.writeFileSync(htmlPath, renderHtmlReport(summary), 'utf-8')
  return { jsonPath, xmlPath, htmlPath, playwrightJson }
}

module.exports = {
  buildRunSummary,
  buildJUnitXml,
  buildStepReports,
  renderHtmlReport,
  writeReports,
  TEMPLATE_NAME,
}
