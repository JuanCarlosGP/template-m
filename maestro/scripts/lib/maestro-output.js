'use strict'

const ICONS = {
  pending: '⬛',
  running: '⏳',
  passed: '✅',
  failed: '❌',
  skipped: '⬛',
}

const PASS_MARKERS = new Set(['✓', '✔', '√', '+', '✅'])
const FAIL_MARKERS = new Set(['✗', '×', '✘', 'X', '❌'])
const RUN_MARKERS = new Set(['>', '⏳'])
const SKIP_MARKERS = new Set(['-', '⬜', '⚪', '⚪️'])
const PENDING_MARKERS = new Set(['?', '○', '◌', '⬛', '🔲', ' '])

/** @type {string | null} */
let lastDeviceIdPrinted = null

function resetMaestroOutputSession() {
  lastDeviceIdPrinted = null
}

/**
 * Transforms Maestro CLI output into the box UI (║) with ⬛/⏳/✅/❌ step icons.
 */
class MaestroStepRenderer {
  constructor(options = {}) {
    /** @type {Map<string, keyof ICONS>} */
    this.steps = new Map()
    /** @type {Map<string, { indent: number, label: string }>} */
    this.displayLabels = new Map()
    /** @type {string[]} */
    this.orderedStepKeys = []
    this.buffer = ''
    /** @type {'box' | 'plain' | null} */
    this.mode = null
    this.flowName = null
    this.lastRunningLine = ''
    /** @type {{ indent: number, label: string, marker: string }[]} */
    this.frameSteps = []
    /** @type {Set<string>} */
    this.lastFrameLabels = new Set()
    /** @type {{ indent: number, label: string, marker: string }[]} */
    this.previousFrameSteps = []
    this.lastMaxIndent = 0
    this.lastBoxRender = ''
    this.liveRedraw = options.liveRedraw ?? true
    this.renderedBoxLines = 0
    /** @type {Map<string, keyof ICONS>} */
    this.lastEmittedStatus = new Map()
    this.boxHeaderEmitted = false
    this.seeded = false
    /** @type {Set<string>} */
    this.hiddenStepKeys = new Set()
    /** @type {Map<string, string>} */
    this.exclusiveBranchWinner = new Map()
    /** @type {{ flowName?: string, steps?: { indent: number, label: string }[] } | null} */
    this.pendingPlan = options.pendingPlan || null
    this.runSucceeded = false
  }

  /** @param {string} key */
  exclusiveGroupId(key) {
    const groups = this.collectExclusiveBranchGroups()
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].includes(key)) return String(i)
    }
    return null
  }

  resetLiveBoxAnchor() {
    this.renderedBoxLines = 0
  }

  /** @param {string} label */
  findStepKeyByLabel(label) {
    const normalized = this.normalizeLabel(label)
    for (const key of this.orderedStepKeys) {
      const meta = this.displayLabels.get(key)
      if (meta && this.normalizeLabel(meta.label) === normalized) {
        return key
      }
    }
    return null
  }

  /**
   * Pre-populate the full Maestro step tree before CLI output arrives.
   * @param {{ flowName?: string, steps?: { indent: number, label: string }[] }} plan
   * @returns {string}
   */
  seedPlan(plan) {
    if (!plan?.steps?.length) return ''

    this.seeded = true
    if (plan.flowName) this.flowName = plan.flowName

    for (const step of plan.steps) {
      const key = this.stepKey(step.indent, step.label)
      this.rememberStep(key, step.indent, step.label)
      if (!this.steps.has(key)) {
        this.steps.set(key, 'pending')
      }
    }

    this.markFirstRunnableStep()
    return this.emitBoxUpdate()
  }

  markFirstRunnableStep() {
    for (const key of this.orderedStepKeys) {
      if (this.isInactivePlatformBranchKey(key)) continue
      const status = this.steps.get(key)
      if (status === 'passed' || status === 'failed' || status === 'skipped') continue
      if (status === 'running') return
      this.steps.set(key, 'running')
      return
    }
  }

  /** @param {string} key */
  isInactivePlatformBranchKey(key) {
    const meta = this.displayLabels.get(key)
    if (!meta) return false
    return this.isInactivePlatformBranch({ indent: meta.indent, label: meta.label }, [])
  }

  /**
   * @param {number} indent
   * @param {string} label
   * @param {keyof ICONS} status
   */
  resolveStepKey(indent, label, status) {
    const exactKey = this.stepKey(indent, label)
    if (this.orderedStepKeys.includes(exactKey)) {
      return exactKey
    }

    const byLabel = this.findStepKeyByLabel(label)
    if (byLabel) {
      const current = this.steps.get(byLabel)
      if (status === 'running' && current === 'passed') {
        return exactKey
      }
      return byLabel
    }

    const normalized = this.normalizeLabel(label)
    /** @type {string | null} */
    let fallback = null

    for (const key of this.orderedStepKeys) {
      const meta = this.displayLabels.get(key)
      if (!meta || meta.indent !== indent) continue
      if (this.normalizeLabel(meta.label) !== normalized) continue
      const current = this.steps.get(key)
      if (status === 'passed' && current === 'passed') continue
      if (status === 'running' && (current === 'running' || current === 'passed')) {
        return key
      }
      if (!fallback) fallback = key
    }

    return fallback || exactKey
  }

  /** @param {string} rootKey */
  markStepTreePassed(rootKey) {
    const rootMeta = this.displayLabels.get(rootKey)
    if (!rootMeta) return
    const rootIdx = this.orderedStepKeys.indexOf(rootKey)
    this.steps.set(rootKey, 'passed')
    for (let i = rootIdx + 1; i < this.orderedStepKeys.length; i++) {
      const key = this.orderedStepKeys[i]
      const meta = this.displayLabels.get(key)
      if (!meta || meta.indent <= rootMeta.indent) break
      this.steps.set(key, 'passed')
    }
  }

  /** @param {string} key @param {keyof ICONS} status */
  applyStepStatus(key, indent, label, status) {
    this.steps.set(key, status)
    this.rememberStep(key, indent, label)

    if (!this.seeded || status !== 'passed') return

    const idx = this.orderedStepKeys.indexOf(key)
    if (idx === -1) return

    for (let i = 0; i < idx; i++) {
      const prevKey = this.orderedStepKeys[i]
      if (this.isInactivePlatformBranchKey(prevKey)) continue
      const prevStatus = this.steps.get(prevKey)
      if (prevStatus === 'failed' || prevStatus === 'skipped') continue
      this.steps.set(prevKey, 'passed')
    }

    for (let i = idx + 1; i < this.orderedStepKeys.length; i++) {
      const nextKey = this.orderedStepKeys[i]
      if (this.isInactivePlatformBranchKey(nextKey)) continue
      const nextStatus = this.steps.get(nextKey)
      if (nextStatus === 'passed' || nextStatus === 'failed' || nextStatus === 'skipped') continue
      this.steps.set(nextKey, 'running')
      break
    }
  }

  /** @param {string} rootKey */
  markStepTreeHidden(rootKey) {
    const rootMeta = this.displayLabels.get(rootKey)
    if (!rootMeta) return
    const rootIdx = this.orderedStepKeys.indexOf(rootKey)
    this.hiddenStepKeys.add(rootKey)
    for (let i = rootIdx + 1; i < this.orderedStepKeys.length; i++) {
      const key = this.orderedStepKeys[i]
      const meta = this.displayLabels.get(key)
      if (!meta || meta.indent <= rootMeta.indent) break
      this.hiddenStepKeys.add(key)
    }
  }

  /** @param {string} rootKey */
  markStepTreeSkipped(rootKey) {
    const rootMeta = this.displayLabels.get(rootKey)
    if (!rootMeta) return
    const rootIdx = this.orderedStepKeys.indexOf(rootKey)
    this.steps.set(rootKey, 'skipped')
    for (let i = rootIdx + 1; i < this.orderedStepKeys.length; i++) {
      const key = this.orderedStepKeys[i]
      const meta = this.displayLabels.get(key)
      if (!meta || meta.indent <= rootMeta.indent) break
      this.steps.set(key, 'skipped')
    }
  }

  /** @param {string} rootKey */
  hasPassedChild(rootKey) {
    const rootMeta = this.displayLabels.get(rootKey)
    if (!rootMeta) return false
    const rootIdx = this.orderedStepKeys.indexOf(rootKey)
    for (let i = rootIdx + 1; i < this.orderedStepKeys.length; i++) {
      const key = this.orderedStepKeys[i]
      const meta = this.displayLabels.get(key)
      if (!meta || meta.indent <= rootMeta.indent) break
      if (this.steps.get(key) === 'passed') return true
    }
    return false
  }

  /** @param {string} label */
  isConditionalRunFlowLabel(label) {
    return /^Run flow when /i.test(label)
  }

  collectExclusiveBranchGroups() {
    /** @type {string[][]} */
    const groups = []
    /** @type {string[]} */
    let current = []

    for (const key of this.orderedStepKeys) {
      const meta = this.displayLabels.get(key)
      const isConditionalBranch = meta && this.isConditionalRunFlowLabel(meta.label)

      if (isConditionalBranch) {
        if (current.length === 0) {
          current.push(key)
          continue
        }
        const prevMeta = this.displayLabels.get(current[current.length - 1])
        if (prevMeta && prevMeta.indent === meta.indent) {
          current.push(key)
          continue
        }
        if (current.length > 1) {
          groups.push(current)
        }
        current = [key]
        continue
      }

      if (current.length === 0 || !meta) continue
      const lastMeta = this.displayLabels.get(current[current.length - 1])
      if (lastMeta && meta.indent <= lastMeta.indent) {
        if (current.length > 1) {
          groups.push(current)
        }
        current = []
      }
    }

    if (current.length > 1) {
      groups.push(current)
    }

    return groups
  }

  /** @param {string} label */
  isBankExpectBranchLabel(label) {
    return /^Run flow when (true|false) is true$/i.test(label)
  }

  /** @param {string} rootKey */
  unhideStepTree(rootKey) {
    const rootMeta = this.displayLabels.get(rootKey)
    if (!rootMeta) return
    const rootIdx = this.orderedStepKeys.indexOf(rootKey)
    this.hiddenStepKeys.delete(rootKey)
    for (let i = rootIdx + 1; i < this.orderedStepKeys.length; i++) {
      const key = this.orderedStepKeys[i]
      const meta = this.displayLabels.get(key)
      if (!meta || meta.indent <= rootMeta.indent) break
      this.hiddenStepKeys.delete(key)
    }
  }

  finalizeResolvedTrueBranchesOnSuccess() {
    if (!this.runSucceeded || !this.seeded) return

    const trueKey = this.findStepKeyByLabel('Run flow when true is true')
    const falseKey = this.findStepKeyByLabel('Run flow when false is true')
    if (!trueKey || !falseKey) return

    // Maestro labels the executed BANK_EXPECT branch as "true is true" and the skipped one as "false is true".
    if (this.steps.get(trueKey) !== 'passed' && !this.hasPassedChild(trueKey)) {
      this.markStepTreePassed(trueKey)
    }
    this.unhideStepTree(trueKey)
    this.markStepTreeHidden(falseKey)
  }

  finalizeExclusiveBranches() {
    for (const keys of this.collectExclusiveBranchGroups()) {
      if (keys.some(key => this.isBankExpectBranchLabel(this.displayLabels.get(key)?.label || ''))) {
        continue
      }
      const passedKey = keys.find(key => this.steps.get(key) === 'passed' || this.hasPassedChild(key))
      if (!passedKey) continue
      for (const key of keys) {
        if (key !== passedKey) {
          this.markStepTreeHidden(key)
        }
      }
    }

    return this.emitBoxUpdate()
  }

  emitFullBoxSnapshot() {
    const box = this.buildBoxOutput()
    if (!box) return ''
    this.lastBoxRender = box
    return `\n${box}\n`
  }

  /** @param {string} chunk @returns {string} */
  process(chunk) {
    this.buffer += chunk
    let out = ''
    let idx
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '')
      this.buffer = this.buffer.slice(idx + 1)
      out += this.processLine(line)
    }
    return out
  }

  flush(options = {}) {
    if (options.success) this.runSucceeded = true
    let out = ''
    if (this.buffer) {
      out += this.processLine(this.buffer.replace(/\r$/, ''))
      this.buffer = ''
    }
    out += this.flushFrame()
    out += this.finalizeExclusiveBranches()
    this.finalizeResolvedTrueBranchesOnSuccess()
    if (options.success && this.seeded && this.liveRedraw) {
      this.lastBoxRender = ''
      out += this.emitBoxUpdate()
    }
    if (this.seeded && !this.liveRedraw) {
      out += this.emitFullBoxSnapshot()
    }
    return out
  }

  /** @param {string} line @returns {string} */
  processLine(line) {
    if (/^\s*$/.test(line)) {
      return this.flushFrame()
    }

    if (/^\s{20,}$/.test(line)) {
      return this.flushFrame()
    }

    if (this.isBoxLine(line)) {
      this.mode = 'box'
      return this.processBoxLine(line)
    }

    if (this.isPlainStepLine(line) || this.isPlainFlowHeader(line)) {
      if (this.mode !== 'plain') this.mode = 'plain'
      return this.processPlainLine(line)
    }

    if (line.startsWith('Running on ')) {
      const flushed = this.flushFrame()
      let out = flushed
      if (this.pendingPlan && !this.seeded) {
        const plan = this.pendingPlan
        this.pendingPlan = null
        out += this.seedPlan(plan)
      }
      const deviceId = line.slice('Running on '.length).trim()
      if (deviceId === lastDeviceIdPrinted) return out
      lastDeviceIdPrinted = deviceId
      const deviceLine = `  Device    ${deviceId}`
      if (deviceLine === this.lastRunningLine) return out
      this.lastRunningLine = deviceLine
      return `${deviceLine}\n${out}`
    }

    if (line.startsWith('Unable to ') || line.startsWith('==== ')) {
      if (this.seeded) return ''
      return `${this.flushFrame()}${line}\n`
    }

    if (this.seeded) return ''
    return `${line}\n`
  }

  flushFrame() {
    if (!this.frameSteps.length) return ''

    const disappeared = [...this.lastFrameLabels].filter(
      key => !this.frameSteps.some(step => this.stepKey(step.indent, step.label) === key),
    )

    this.inferFrameStatuses(this.frameSteps, disappeared)

    for (const key of disappeared) {
      const prev = this.steps.get(key)
      if (prev === 'failed' || prev === 'skipped') continue
      this.steps.set(key, 'passed')
    }

    for (const step of this.frameSteps) {
      const key = this.stepKey(step.indent, step.label)
      this.rememberStep(key, step.indent, step.label)
    }

    this.lastFrameLabels = new Set(this.frameSteps.map(step => this.stepKey(step.indent, step.label)))
    this.previousFrameSteps = [...this.frameSteps]
    this.lastMaxIndent = Math.max(0, ...this.frameSteps.map(step => step.indent))
    this.frameSteps = []

    return this.emitBoxUpdate()
  }

  /**
   * @param {{ indent: number, label: string, marker: string }[]} frameSteps
   * @param {string[]} disappeared
   */
  inferFrameStatuses(frameSteps, disappeared = []) {
    /** @type {Map<string, keyof ICONS>} */
    const statuses = new Map()

    for (const step of frameSteps) {
      const key = this.stepKey(step.indent, step.label)
      const markerStatus = this.statusFromMarker(step.marker, step.label)
      if (markerStatus !== 'pending' || !PENDING_MARKERS.has(step.marker)) {
        statuses.set(key, markerStatus)
      }
    }

    for (const step of frameSteps) {
      const key = this.stepKey(step.indent, step.label)
      if (this.steps.get(key) === 'passed') {
        statuses.set(key, 'passed')
      }
    }

    for (const step of frameSteps) {
      const key = this.stepKey(step.indent, step.label)
      if (!statuses.has(key)) {
        statuses.set(key, 'pending')
      }
    }

    for (const step of frameSteps) {
      const key = this.stepKey(step.indent, step.label)
      if (this.isInactivePlatformBranch(step, frameSteps)) {
        const current = statuses.get(key)
        if (current !== 'skipped' && current !== 'failed') {
          statuses.set(key, 'pending')
        }
      }
    }

    let maxActiveIndent = -1
    for (const step of frameSteps) {
      const key = this.stepKey(step.indent, step.label)
      const st = statuses.get(key)
      if (st === 'passed' || st === 'skipped' || st === 'failed') continue
      if (this.isInactivePlatformBranch(step, frameSteps)) continue
      maxActiveIndent = Math.max(maxActiveIndent, step.indent)
    }

    if (maxActiveIndent !== -1) {
      let runningIdx = -1
      for (let i = 0; i < frameSteps.length; i++) {
        const step = frameSteps[i]
        if (step.indent !== maxActiveIndent) continue
        const key = this.stepKey(step.indent, step.label)
        const st = statuses.get(key)
        if (st === 'passed' || st === 'skipped' || st === 'failed') continue
        if (this.isInactivePlatformBranch(step, frameSteps)) continue
        runningIdx = i
        statuses.set(key, 'running')
        break
      }

      if (runningIdx !== -1) {
        const runningIndent = frameSteps[runningIdx].indent
        for (let i = 0; i < runningIdx; i++) {
          const step = frameSteps[i]
          if (step.indent !== runningIndent) continue
          const key = this.stepKey(step.indent, step.label)
          if (statuses.get(key) !== 'skipped' && statuses.get(key) !== 'failed') {
            statuses.set(key, 'passed')
          }
        }

        let childIndent = runningIndent
        for (let i = runningIdx - 1; i >= 0; i--) {
          const step = frameSteps[i]
          if (step.indent >= childIndent) continue
          const key = this.stepKey(step.indent, step.label)
          if (this.isInactivePlatformBranch(step, frameSteps)) continue
          if (statuses.get(key) === 'skipped' || statuses.get(key) === 'failed') continue
          statuses.set(key, 'running')
          childIndent = step.indent
        }
      }
    }

    const currentMaxIndent = Math.max(0, ...frameSteps.map(step => step.indent))
    if (disappeared.length > 0 && this.lastMaxIndent > currentMaxIndent) {
      for (const step of frameSteps) {
        const key = this.stepKey(step.indent, step.label)
        if (!this.hadChildDisappear(step, disappeared, this.previousFrameSteps)) continue
        if (statuses.get(key) !== 'failed' && statuses.get(key) !== 'skipped') {
          statuses.set(key, 'passed')
        }
      }
    }

    for (const [key, status] of statuses) {
      this.steps.set(key, status)
    }
  }

  /**
   * @param {{ indent: number, label: string }} step
   * @param {{ indent: number, label: string }[]} frameSteps
   */
  isInactivePlatformBranch(step, frameSteps) {
    if (!/when Platform is IOS/i.test(step.label)) return false

    const androidInFrame = frameSteps.find(
      item => item.indent === step.indent && /when Platform is ANDROID/i.test(item.label),
    )
    if (androidInFrame) {
      const androidKey = this.stepKey(androidInFrame.indent, androidInFrame.label)
      if (this.steps.get(androidKey) === 'passed') return true
    }

    for (const [key, status] of this.steps.entries()) {
      if (status === 'passed' && /when Platform is ANDROID/i.test(key)) {
        return true
      }
    }

    return false
  }

  /**
   * @param {{ indent: number, label: string }} step
   * @param {string[]} disappeared
   * @param {{ indent: number, label: string }[]} previousFrameSteps
   */
  hadChildDisappear(step, disappeared, previousFrameSteps) {
    const targetKey = this.stepKey(step.indent, step.label)
    const stepIdx = previousFrameSteps.findIndex(
      item => this.stepKey(item.indent, item.label) === targetKey,
    )
    if (stepIdx === -1) return false

    const nextIdx = previousFrameSteps.findIndex(
      (item, idx) => idx > stepIdx && item.indent <= step.indent,
    )
    const end = nextIdx === -1 ? previousFrameSteps.length : nextIdx
    const childKeys = new Set(
      previousFrameSteps
        .slice(stepIdx + 1, end)
        .filter(item => item.indent > step.indent)
        .map(item => this.stepKey(item.indent, item.label)),
    )

    return disappeared.some(key => childKeys.has(key))
  }

  /** @param {string} label */
  shouldIgnoreRuntimeLabel(label) {
    if (!this.seeded) return false
    return /\$\{BANK_EXPECT/.test(label)
  }

  /** @param {string} key @param {number} indent @param {string} label */
  rememberStep(key, indent, label) {
    if (this.shouldIgnoreRuntimeLabel(label)) return

    if (this.seeded) {
      const existing = this.findStepKeyByLabel(label)
      if (existing && existing !== key) return
    }

    if (!this.orderedStepKeys.includes(key)) {
      this.orderedStepKeys.push(key)
    }
    this.updateDisplayLabel(key, indent, label)
  }

  /** @param {string} key @param {number} indent @param {string} label */
  updateDisplayLabel(key, indent, label) {
    const trimmed = label.trim()
    const prev = this.displayLabels.get(key)
    if (!prev) {
      this.displayLabels.set(key, { indent, label: trimmed })
      return
    }
    if (prev.label.includes('${') && !trimmed.includes('${')) {
      this.displayLabels.set(key, { indent, label: trimmed })
    } else if (/\(skipped\)/i.test(trimmed)) {
      this.displayLabels.set(key, { indent, label: trimmed })
    }
  }

  buildBoxOutput() {
    if (!this.flowName || !this.orderedStepKeys.length) return ''
    const lines = [' ║', ` ║  > Flow: ${this.flowName}`, ' ║']
    for (const key of this.orderedStepKeys) {
      if (this.hiddenStepKeys.has(key)) continue
      const status = this.steps.get(key) || 'pending'
      lines.push(this.formatStepLineFromKey(key, status))
    }
    return lines.join('\n')
  }

  emitBoxUpdate() {
    const box = this.buildBoxOutput()
    if (!box || box === this.lastBoxRender) return ''

    if (this.liveRedraw) {
      let prefix = ''
      if (this.renderedBoxLines > 0) {
        prefix = `\x1b[${this.renderedBoxLines}A\x1b[0J`
      }
      this.lastBoxRender = box
      this.renderedBoxLines = box.split('\n').length
      return `${prefix}${box}\n`
    }

    if (!this.boxHeaderEmitted) {
      this.boxHeaderEmitted = true
      this.lastBoxRender = box
      for (const key of this.orderedStepKeys) {
        this.lastEmittedStatus.set(key, this.steps.get(key) || 'pending')
      }
      return `${box}\n`
    }

    let out = ''
    for (const key of this.orderedStepKeys) {
      if (this.hiddenStepKeys.has(key)) continue
      const status = this.steps.get(key) || 'pending'
      if (this.seeded && status === 'running') continue
      if (this.lastEmittedStatus.get(key) === status) continue
      this.lastEmittedStatus.set(key, status)
      out += `${this.formatStepLineFromKey(key, status)}\n`
    }

    this.lastBoxRender = box
    return out
  }

  /** @param {string} key @param {keyof ICONS} status */
  formatStepLineFromKey(key, status) {
    const meta = this.displayLabels.get(key)
    if (!meta) {
      const sep = key.indexOf('|')
      const indent = Number(key.slice(0, sep))
      const label = key.slice(sep + 1)
      return this.formatStepLine(indent, label, status)
    }
    return this.formatStepLine(meta.indent, meta.label, status)
  }

  /** @param {number} indent @param {string} label */
  stepKey(indent, label) {
    return `${indent}|${this.normalizeLabel(label)}`
  }

  /** @param {string} label */
  normalizeLabel(label) {
    let normalized = label.trim().replace(/\s*\(skipped\)\s*$/i, '')
    if (/^Launch app /i.test(normalized)) {
      return 'Launch app'
    }
    return normalized
  }

  /** @param {string} line */
  isBoxLine(line) {
    return /^\s*(?:║|\?)\s*(?:$|> Flow:|(?: +(?:[^\s]{1,3}\s+)?.+))/.test(line)
  }

  /** @param {string} line */
  isPlainFlowHeader(line) {
    return /^\s*>\s*Flow(?:\s*:|\s+)\S/.test(line)
  }

  /** @param {string} line */
  isPlainStepLine(line) {
    return /^(\s*)(Run .+|Launch .+|Assert .+|Tap .+|Input .+|Scroll .+|Swipe .+|Open .+|Press .+|Hide .+|Copy .+|Paste .+|Eval .+|Apply .+|Double .+|Long .+|Back .+|Set .+|Remove .+|Add .+|Start .+|Stop .+|Take .+|Clear .+|Extended .+|Repeat .+|Run flow .+)(\.\.\.)?(?:\s+(COMPLETED|FAILED|SKIPPED))?\s*$/.test(line)
  }

  /** @param {string} line */
  processBoxLine(line) {
    const trimmed = line.trim()

    if (trimmed === '║' || trimmed === '?') {
      return ''
    }

    const flowHeader = line.match(/^\s*(?:║|\?)\s+>\s*Flow:\s*(.+)$/)
    if (flowHeader) {
      this.flowName = flowHeader[1].trim()
      return ''
    }

    const step = line.match(/^\s*(?:║|\?)( +)(?:([^\s]{1,3})\s+)?(.*)$/)
    if (step && !line.includes('> Flow:')) {
      this.frameSteps.push({
        indent: Math.max(1, Math.floor(step[1].length / 2)),
        marker: (step[2] || ' ').trim() || ' ',
        label: step[3].trim(),
      })
      return ''
    }

    return `${line.replace(/^\s*\?/, ' ║')}\n`
  }

  /** @param {string} whitespace */
  plainLineIndent(whitespace) {
    if (whitespace.length === 0) return 1
    return Math.max(2, Math.floor(whitespace.length / 2) + 1)
  }

  /** @param {string} key @param {number} indent */
  promoteSiblingRunningToPassed(key, indent) {
    for (const stepKey of this.orderedStepKeys) {
      if (stepKey === key) break
      if (this.steps.get(stepKey) !== 'running') continue
      const stepIndent = Number(stepKey.split('|')[0])
      if (stepIndent !== indent) continue
      const stepLabel = this.displayLabels.get(stepKey)?.label || ''
      if (this.isConditionalRunFlowLabel(stepLabel)) continue
      this.steps.set(stepKey, 'passed')
    }
  }

  /** @param {string} line */
  processPlainLine(line) {
    const flowHeader = line.match(/^\s*>\s*Flow(?:\s*:|\s+)(.+)$/)
    if (flowHeader) {
      this.flowName = flowHeader[1].trim()
      if (this.seeded) return ''
      return this.emitBoxUpdate()
    }

    const step = line.match(/^(\s*)(.+?)(\.\.\.)?(?:\s+(COMPLETED|FAILED|SKIPPED))?\s*$/)
    if (!step) return `${line}\n`

    const indent = this.plainLineIndent(step[1])
    const label = step[2].trim()
    let status = 'running'
    if (step[4] === 'FAILED') status = 'failed'
    else if (step[4] === 'COMPLETED') status = 'passed'
    else if (step[4] === 'SKIPPED') status = 'skipped'

    let key = this.resolveStepKey(indent, label, status)
    const existingKey = this.findStepKeyByLabel(label)
    if (this.seeded && existingKey && !this.orderedStepKeys.includes(key)) {
      key = existingKey
    }

    if (status === 'running') {
      this.promoteSiblingRunningToPassed(key, indent)
      const groupId = this.exclusiveGroupId(key)
      if (groupId && !this.exclusiveBranchWinner.has(groupId)) {
        this.exclusiveBranchWinner.set(groupId, key)
      }
    }

    if (this.seeded && status === 'skipped' && this.isConditionalRunFlowLabel(label)) {
      const groupId = this.exclusiveGroupId(key)
      const winner = groupId ? this.exclusiveBranchWinner.get(groupId) : null
      if (winner === key) {
        this.markStepTreePassed(key)
      } else {
        this.markStepTreeHidden(key)
      }
      return this.emitBoxUpdate()
    }

    this.applyStepStatus(key, indent, label, status)
    if (this.seeded && status === 'running' && !this.liveRedraw) {
      return ''
    }
    return this.emitBoxUpdate()
  }

  /**
   * @param {string} marker
   * @param {string} label
   * @returns {keyof ICONS}
   */
  statusFromMarker(marker, label) {
    if (/FAILED/i.test(label)) return 'failed'
    if (/SKIPPED/i.test(label) || /\(skipped\)/i.test(label)) return 'skipped'
    if (FAIL_MARKERS.has(marker)) return 'failed'
    if (PASS_MARKERS.has(marker)) return 'passed'
    if (RUN_MARKERS.has(marker)) return 'running'
    if (SKIP_MARKERS.has(marker)) return 'skipped'
    if (PENDING_MARKERS.has(marker)) return 'pending'
    return 'pending'
  }

  /**
   * @param {number} indent
   * @param {string} label
   * @param {keyof ICONS} status
   */
  formatStepLine(indent, label, status) {
    const icon = ICONS[status] || ICONS.pending
    const pad = ' '.repeat(indent * 2)
    return ` ║${pad}${icon}   ${label.trim()}`
  }
}

module.exports = {
  ICONS,
  MaestroStepRenderer,
  resetMaestroOutputSession,
}
