#!/usr/bin/env node
/**
 * Write a short run summary markdown from reports/summary.json.
 * Always safe to run after gherkin-runner (pass or fail).
 *
 * Env:
 *   REPORT_DIR — default reports
 * Writes: reports/ci-summary.md and appends to GITHUB_STEP_SUMMARY if set.
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { listScenarioResults } = require('../lib/playwright-report')

function fmtSec(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—'
  return `${(Number(ms) / 1000).toFixed(1)}s`
}

function main() {
  const reportDir = path.resolve(process.env.REPORT_DIR || 'reports')
  const summaryPath = path.join(reportDir, 'summary.json')
  const outPath = path.join(reportDir, 'ci-summary.md')

  if (!fs.existsSync(summaryPath)) {
    const md = `## Resultado E2E

**Estado:** sin informe (\`summary.json\` no generado)
`
    fs.mkdirSync(reportDir, { recursive: true })
    fs.writeFileSync(outPath, md, 'utf8')
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${md}\n`)
    }
    console.log(md)
    return
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
  const results = listScenarioResults(summary)
  const passed = summary.stats?.expected
    ?? results.filter((r) => r.status === 'passed').length
  const failed = summary.stats?.unexpected
    ?? results.filter((r) => r.status === 'failed').length
  const duration = summary.stats?.duration
  const ok = failed === 0
  const lines = []

  lines.push('## Resultado E2E')
  lines.push('')
  lines.push(`**Estado:** ${ok ? 'todos los tests OK' : 'hay fallos'}`)
  lines.push(`**Resumen:** ${passed} passed · ${failed} failed · ${fmtSec(duration)}`)
  lines.push('')

  if (results.length) {
    lines.push('| Escenario | Plataforma | Resultado | Tiempo |')
    lines.push('|-----------|------------|-----------|--------|')
    for (const r of results) {
      const name = String(r.title || r.scenario || '—').replace(/\|/g, '\\|')
      const status = r.status === 'passed' ? 'PASS' : r.status === 'skipped' ? 'SKIP' : 'FAIL'
      lines.push(`| ${name} | ${r.platform || '—'} | ${status} | ${fmtSec(r.durationMs)} |`)
    }
    lines.push('')
  }

  if (!ok) {
    lines.push('Si el triage del Agente corrió, verás debajo **Solución sugerida** y el detalle en `ci-triage.md`.')
    lines.push('')
  }

  const md = `${lines.join('\n')}\n`
  fs.writeFileSync(outPath, md, 'utf8')
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${md}\n`)
  }
  console.log(md)
}

main()
