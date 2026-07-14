'use strict'

const fs = require('fs')
const path = require('path')

/**
 * Builds the Maestro CLI step tree from flow YAML so the terminal UI can show
 * all future steps (⬛) before Maestro reports them.
 */

function unquote(value) {
  const trimmed = String(value).trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function readFlow(absPath) {
  const content = fs.readFileSync(absPath, 'utf8')
  const split = content.split(/^---\s*$/m)
  const header = split[0] || ''
  const body = split[1] || ''
  const nameMatch = header.match(/^name:\s*(.+)$/m)
  const appIdMatch = header.match(/^appId:\s*(.+)$/m)
  return {
    name: nameMatch ? nameMatch[1].trim() : path.basename(absPath, '.yml'),
    appId: appIdMatch ? appIdMatch[1].trim() : '${APP_ID}',
    body,
    dir: path.dirname(absPath),
  }
}

function splitTopLevelItems(body) {
  const lines = body.split(/\r?\n/)
  /** @type {string[][]} */
  const items = []
  /** @type {string[] | null} */
  let current = null

  for (const line of lines) {
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue
    if (/^-\s/.test(line)) {
      if (current) items.push(current)
      current = [line]
      continue
    }
    if (current) current.push(line)
  }
  if (current) items.push(current)
  return items.map(block => block.join('\n'))
}

function readBlockValue(block, key) {
  const re = new RegExp(`^\\s*${key}:(?:[ \\t]([^\\n]*))?$`, 'm')
  const match = block.match(re)
  if (!match) return null
  const raw = (match[1] || '').trim()
  if (raw) return unquote(raw)

  const lines = block.split(/\r?\n/)
  const keyLine = lines.findIndex(line => new RegExp(`^\\s*${key}:\\s*$`).test(line))
  if (keyLine === -1) return null
  const keyIndent = lines[keyLine].match(/^(\s*)/)[1].length
  /** @type {Record<string, string>} */
  const obj = {}
  for (let i = keyLine + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue
    const indent = line.match(/^(\s*)/)[1].length
    if (indent <= keyIndent) break
    const kv = line.match(/^\s*([\w]+):\s*(.*)$/)
    if (!kv) continue
    obj[kv[1]] = unquote(kv[2])
  }
  return obj
}

function readNestedList(block, key) {
  const lines = block.split(/\r?\n/)
  const keyLine = lines.findIndex(line => new RegExp(`^\\s*${key}:\\s*$`).test(line))
  if (keyLine === -1) return []

  const keyIndent = lines[keyLine].match(/^(\s*)/)[1].length
  const nestedLines = []
  for (let i = keyLine + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue
    const indent = line.match(/^(\s*)/)[1].length
    if (indent <= keyIndent) break
    nestedLines.push(line.slice(keyIndent + 2))
  }
  return splitTopLevelItems(nestedLines.join('\n'))
}

function normalizeRunPath(fromDir, fileRef) {
  const resolved = path.resolve(fromDir, fileRef).replace(/\\/g, '/')
  const from = fromDir.replace(/\\/g, '/')
  const rel = path.relative(from, resolved).replace(/\\/g, '/')
  if (rel.startsWith('..')) return rel
  return `../${rel}`
}

function platformLabel(platform) {
  if (platform === 'Android') return 'ANDROID'
  if (platform === 'iOS') return 'IOS'
  return String(platform).toUpperCase()
}

function isActivePlatformBranch(whenPlatform, runtimePlatform) {
  if (!whenPlatform || !runtimePlatform) return true
  const expected = whenPlatform.toLowerCase()
  const actual = runtimePlatform.toLowerCase()
  return expected === actual
}

function conditionalRunFlowLabel(when, env = {}) {
  if (!when || typeof when !== 'object') return 'Run flow'
  if (when.visible) return `Run flow when "${when.visible}" is visible`
  if (when.platform) return `Run flow when Platform is ${platformLabel(when.platform)}`
  if (when.notVisible) return `Run flow when "${when.notVisible}" is not visible`
  if (when.true) return resolveWhenTrueLabel(when.true, env)
  return 'Run flow'
}

function resolveWhenTrueLabel(expression, env = {}) {
  const expr = String(expression || '').trim()
  if (expr === "${BANK_EXPECT == 'success'}") {
    if (env.BANK_EXPECT === 'success') return 'Run flow when true is true'
    if (env.BANK_EXPECT === 'error') return 'Run flow when false is true'
  }
  if (expr === "${BANK_EXPECT == 'error'}") {
    if (env.BANK_EXPECT === 'error') return 'Run flow when true is true'
    if (env.BANK_EXPECT === 'success') return 'Run flow when false is true'
  }
  return `Run flow when ${expr} is true`
}

function commandToPlannedSteps(commandBlock, appId, env) {
  const firstLine = commandBlock.split(/\r?\n/)[0].trim()

  if (/^- launchApp/.test(firstLine)) {
    return [{ label: `Launch app "${appId}"` }]
  }

  const assertMatch = firstLine.match(/^- assertVisible:\s*(.+)$/)
  if (assertMatch) {
    const text = unquote(assertMatch[1])
    return [{ label: `Assert that "${text}" is visible` }]
  }

  if (/^- extendedWaitUntil:/.test(firstLine)) {
    const visible = readBlockValue(commandBlock, 'visible')
    if (visible) return [{ label: `Assert that "${visible}" is visible` }]
  }

  if (/^- tapOn:/.test(firstLine)) {
    const id = readBlockValue(commandBlock, 'id')
    if (id) return [{ label: `Tap on id: ${id}` }]
    const text = readBlockValue(commandBlock, 'text')
    if (text) return [{ label: `Tap on "${text}"` }]
    const scalar = firstLine.match(/^- tapOn:\s*(.+)$/)
    if (scalar) return [{ label: `Tap on "${unquote(scalar[1])}"` }]
  }

  const inputMatch = firstLine.match(/^- inputText:\s*(.+)$/)
  if (inputMatch) {
    const text = unquote(inputMatch[1])
    return [{ label: `Input text ${text}` }]
  }

  if (/^- inputText:/.test(firstLine)) {
    const text = readBlockValue(commandBlock, 'text')
    if (text) return [{ label: `Input text ${text}` }]
  }

  return []
}

function parseRunFlowBlock(block, fromDir, runtimePlatform, env, indent, visited) {
  /** @type {{ indent: number, label: string }[]} */
  const steps = []
  const firstLine = block.split(/\r?\n/)[0].trim()
  let file = readBlockValue(block, 'file')
  if (!file) {
    const scalar = firstLine.match(/^- runFlow:\s*(.+)$/)
    if (scalar) file = unquote(scalar[1])
  }
  const when = readBlockValue(block, 'when')
  const commands = readNestedList(block, 'commands')

  if (file) {
    const relPath = normalizeRunPath(fromDir, file)
    let label = `Run ${relPath}`
    if (when && typeof when === 'object' && when.platform) {
      label += ` when Platform is ${platformLabel(when.platform)}`
    }
    steps.push({ indent, label })

    const includeChildren = !when?.platform || isActivePlatformBranch(when.platform, runtimePlatform)
    if (includeChildren) {
      const childPath = path.resolve(fromDir, file)
      steps.push(...planFlowSteps(childPath, runtimePlatform, env, indent + 1, visited))
    }
    return steps
  }

  if (commands.length > 0) {
    const when = readBlockValue(block, 'when')
    steps.push({ indent, label: conditionalRunFlowLabel(when, env) })
    for (const commandBlock of commands) {
      steps.push(...commandToPlannedSteps(commandBlock, '${APP_ID}', env).map(step => ({
        indent: indent + 1,
        label: step.label,
      })))
    }
    return steps
  }

  return steps
}

function planCommandBlock(block, flowMeta, runtimePlatform, env, indent, visited) {
  const firstLine = block.split(/\r?\n/)[0].trim()
  if (/^- runFlow:/.test(firstLine)) {
    return parseRunFlowBlock(block, flowMeta.dir, runtimePlatform, env, indent, visited)
  }
  return commandToPlannedSteps(block, flowMeta.appId, env).map(step => ({
    indent,
    label: step.label,
  }))
}

/**
 * @param {string} absPath
 * @param {string | undefined} runtimePlatform
 * @param {Record<string, string>} env
 * @param {number} indent
 * @param {Set<string>} visited
 * @returns {{ indent: number, label: string }[]}
 */
function planFlowSteps(absPath, runtimePlatform, env, indent = 1, visited = new Set()) {
  const resolved = path.resolve(absPath)
  if (visited.has(resolved)) return []
  visited.add(resolved)

  if (!fs.existsSync(resolved)) return []

  const flowMeta = readFlow(resolved)
  /** @type {{ indent: number, label: string }[]} */
  const steps = []

  for (const block of splitTopLevelItems(flowMeta.body)) {
    steps.push(...planCommandBlock(block, flowMeta, runtimePlatform, env, indent, visited))
  }

  return steps
}

/**
 * @param {string} flowFile absolute or cwd-relative path to the entry flow
 * @param {{ platform?: string, env?: Record<string, string> }} [options]
 * @returns {{ flowName: string, steps: { indent: number, label: string }[] }}
 */
function buildFlowStepPlan(flowFile, options = {}) {
  const absPath = path.resolve(flowFile)
  const flowMeta = readFlow(absPath)
  const runtimePlatform = options.platform
  const env = options.env || {}
  const steps = planFlowSteps(absPath, runtimePlatform, env)

  // Include inactive platform branches at the entry level (Maestro shows them after the active branch).
  const entryBlocks = splitTopLevelItems(flowMeta.body)
  for (const block of entryBlocks) {
    if (!/^- runFlow:/.test(block)) continue
    const when = readBlockValue(block, 'when')
    const file = readBlockValue(block, 'file')
    if (!file || !when?.platform) continue
    if (isActivePlatformBranch(when.platform, runtimePlatform)) continue
    const relPath = normalizeRunPath(flowMeta.dir, file)
    const label = `Run ${relPath} when Platform is ${platformLabel(when.platform)}`
    if (!steps.some(step => step.label === label)) {
      steps.push({ indent: 1, label })
    }
  }

  return { flowName: flowMeta.name, steps }
}

module.exports = {
  buildFlowStepPlan,
  planFlowSteps,
}
