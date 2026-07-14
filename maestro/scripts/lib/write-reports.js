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

function buildRunSummary({ startedAt, finishedAt, perPlatform, version }) {
  let passed = 0
  let failed = 0

  const platforms = perPlatform.map(({ platform, results }) => {
    const mapped = results.map(r => {
      if (r.status === 'passed') passed++
      else failed++
      return {
        scenario: r.scenarioName,
        status: r.status,
        error: r.error || null,
        screenshotPath: r.screenshotPath || null,
        testCaseId: r.testCaseId ?? null,
      }
    })
    return { name: platform, results: mapped }
  })

  return {
    template: TEMPLATE_NAME,
    version: version || '0.0.0',
    startedAt,
    finishedAt,
    passed,
    failed,
    platforms,
  }
}

function buildJUnitXml(summary) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>']
  lines.push('<testsuites>')

  for (const platform of summary.platforms) {
    const failures = platform.results.filter(r => r.status === 'failed').length
    const tests = platform.results.length
    lines.push(
      `<testsuite name="${escapeXml(platform.name)}" tests="${tests}" failures="${failures}" errors="0">`,
    )
    for (const result of platform.results) {
      const name = escapeXml(result.scenario)
      if (result.status === 'failed') {
        const message = escapeXml(result.error || 'Test failed')
        lines.push(`  <testcase name="${name}">`)
        lines.push(`    <failure message="${message}">${message}</failure>`)
        lines.push('  </testcase>')
      } else {
        lines.push(`  <testcase name="${name}"/>`)
      }
    }
    lines.push('</testsuite>')
  }

  lines.push('</testsuites>')
  return lines.join('\n')
}

function writeReports(summary, reportDir) {
  fs.mkdirSync(reportDir, { recursive: true })
  const jsonPath = path.join(reportDir, 'summary.json')
  const xmlPath = path.join(reportDir, 'junit.xml')
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf-8')
  fs.writeFileSync(xmlPath, buildJUnitXml(summary), 'utf-8')
  return { jsonPath, xmlPath }
}

module.exports = {
  buildRunSummary,
  buildJUnitXml,
  writeReports,
  TEMPLATE_NAME,
}
