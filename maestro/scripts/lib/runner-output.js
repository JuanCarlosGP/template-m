'use strict'

const path = require('path')
const os = require('os')

const SENSITIVE_KEYS = new Set([
  'PASSWORD',
  'AZURE_DEVOPS_PAT',
  'PAT',
  'TOKEN',
  'SECRET',
  'API_KEY',
])

function isVerbose() {
  return /^(1|true|yes)$/i.test(
    process.env.GHERKIN_RUNNER_VERBOSE || process.env.MAESTRO_VERBOSE || '',
  )
}

/** One-line flow headers by default; set GHERKIN_RUNNER_COMPACT=0 for the multi-line block. */
function isCompact() {
  if (isVerbose()) return false
  const raw = process.env.GHERKIN_RUNNER_COMPACT
  if (raw == null || raw === '') return true
  return !/^(0|false|no)$/i.test(raw)
}

const FLOW_LAUNCH_OMIT_ENV = new Set(['PLATFORM', 'APP_ID', 'APP_NAME'])

function shortenPath(absPath) {
  if (!absPath) return ''
  const normalized = path.resolve(absPath)
  const home = os.homedir()
  let display = normalized
  if (display.startsWith(home)) {
    display = `~${display.slice(home.length)}`
  }
  const cwd = process.cwd()
  if (normalized.startsWith(cwd)) {
    const rel = path.relative(cwd, normalized)
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.replace(/\\/g, '/')
    }
  }
  return display.replace(/\\/g, '/')
}

function maskEnvValue(key, value) {
  if (value == null || value === '') return ''
  if (SENSITIVE_KEYS.has(key)) return '••••'
  const s = String(value)
  if (s.length > 48) return `${s.slice(0, 45)}…`
  return s
}

function formatEnvPairs(env, { omit = ['PLATFORM'] } = {}) {
  const skip = new Set(omit)
  return Object.keys(env)
    .filter(k => !skip.has(k))
    .sort()
    .map(k => `${k}=${maskEnvValue(k, env[k])}`)
}

function truncate(text, maxLen) {
  const s = String(text || '')
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen - 1)}…`
}

function padVisible(text, width) {
  const s = String(text)
  if (s.length >= width) return s
  return s + ' '.repeat(width - s.length)
}

/**
 * @param {string} title
 * @param {string[]} bodyLines
 * @param {number} [width]
 */
function drawLabeledBox(title, bodyLines, width = 72) {
  const contentWidth = Math.max(
    title.length,
    ...bodyLines.map(line => line.length),
    8,
  )
  const inner = Math.min(Math.max(contentWidth, width - 4), width - 4)
  const bar = '─'.repeat(inner + 2)
  const lines = [
    ` ╭─ ${title} ${'─'.repeat(Math.max(0, inner - title.length - 1))}╮`,
    ...bodyLines.map(line => ` │ ${padVisible(truncate(line, inner), inner)} │`),
    ` ╰${bar}╯`,
  ]
  return lines.join('\n')
}

/**
 * @param {string} displayName
 * @param {{ featureFile?: string, platform?: string }} [meta]
 */
function formatScenarioHeader(displayName, meta = {}) {
  const body = [displayName.replace(/^"|"$/g, '')]
  if (meta.featureFile) body.push(`feature: ${meta.featureFile}`)
  if (meta.platform) body.push(`platform: ${meta.platform}`)
  return `\n${drawLabeledBox('Scenario', body)}\n`
}

/**
 * @param {{ keyword: string, text: string, flow: string | null }[]} steps
 */
function formatGherkinSteps(steps) {
  if (!steps.length) return ''
  const lines = ['', '  Gherkin']
  const textCol = 44

  for (const step of steps) {
    const keyword = (step.keyword || 'Step').padEnd(5)
    const icon = step.flow ? '▶' : '◌'
    const note = step.flow ? `→ ${step.flow}` : 'en flow'
    const text = padVisible(truncate(step.text, textCol), textCol)
    lines.push(`  ${icon} ${keyword} ${text}  ${note}`)
  }

  return `${lines.join('\n')}\n`
}

/**
 * @param {{ flowName: string, flowFile: string, platform: string, env: Record<string, string> }} opts
 */
function formatFlowLaunch(opts) {
  const { flowName, flowFile, platform, env } = opts
  const envPairs = formatEnvPairs(env, { omit: [...FLOW_LAUNCH_OMIT_ENV] })

  if (isCompact()) {
    const suffix = envPairs.length ? `  ${envPairs.join('  ')}` : ''
    return `\n  ▶ ${flowName}${suffix}\n`
  }

  const relFlow = shortenPath(flowFile)
  const fullEnvPairs = formatEnvPairs(env)
  const lines = [
    '',
    '  Maestro',
    `  Flow      ${flowName}  (${relFlow})`,
    `  Platform  ${platform}`,
  ]
  if (fullEnvPairs.length) {
    lines.push(`  Env       ${fullEnvPairs.join('  ')}`)
  }
  if (isVerbose()) {
    lines.push('  (verbose) full env and CLI printed below')
  }
  return `${lines.join('\n')}\n`
}

function formatMaestroCommand(maestroBin, maestroArgs) {
  if (!isVerbose()) return ''
  const relBin = shortenPath(maestroBin)
  const displayArgs = maestroArgs.map(arg => (
    /\.ya?ml$/i.test(arg) ? shortenPath(arg) : arg
  ))
  return `  CLI  ${relBin} ${displayArgs.join(' ')}\n`
}

function formatFlowResult(flowName, status) {
  const icon = status === 'passed' ? '✅' : '❌'
  return `  ${icon} Flow ${flowName} ${status}\n`
}

function formatFeatureHeader(fileName) {
  return `\n${drawLabeledBox('Feature', [fileName])}\n`
}

function formatSessionPrepNote() {
  return '  Prep      sesión CLI reiniciada\n'
}

module.exports = {
  isVerbose,
  isCompact,
  shortenPath,
  maskEnvValue,
  formatEnvPairs,
  drawLabeledBox,
  formatScenarioHeader,
  formatGherkinSteps,
  formatFlowLaunch,
  formatMaestroCommand,
  formatFlowResult,
  formatFeatureHeader,
  formatSessionPrepNote,
}
