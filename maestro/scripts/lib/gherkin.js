'use strict'

const fs = require('fs')
const { generateMessages } = require('@cucumber/gherkin')
const { IdGenerator } = require('@cucumber/messages')

const GHERKIN_MEDIA_TYPE = 'text/x.cucumber.gherkin+plain'

function generateFeatureMessages(source, uri, { includePickles = false } = {}) {
  return generateMessages(source, uri, GHERKIN_MEDIA_TYPE, {
    newId: IdGenerator.uuid(),
    includeGherkinDocument: true,
    includePickles,
  })
}

function parseFeature(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8')
  const messages = generateFeatureMessages(source, filePath, { includePickles: false })
  const parseError = messages.find(m => m.parseError)
  if (parseError) throw new Error(parseError.parseError.message)
  const docMessage = messages.find(m => m.gherkinDocument)
  if (!docMessage) throw new Error('No gherkin document found')
  return docMessage.gherkinDocument
}

function getPickles(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8')
  const messages = generateFeatureMessages(source, filePath, { includePickles: true })
  const parseError = messages.find(m => m.parseError)
  if (parseError) throw new Error(parseError.parseError.message)
  return messages.filter(m => m.pickle).map(m => m.pickle)
}

function getPickleStepTexts(pickle) {
  return (pickle.steps || []).map(step => step.text)
}

/** Stable dedup key: same flow + same params runs once; different params run separately. */
function flowRunKey(flow, params = {}) {
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('|')
  return `${flow}::${sorted}`
}

/**
 * Resolve Gherkin step texts into ordered Maestro flows (deduped by flowRunKey).
 * @param {string[]} stepTexts
 * @param {(text: string) => { flow: string|null, params: object }} resolveStepFn
 */
function buildFlowsFromSteps(stepTexts, resolveStepFn) {
  const flowsToRun = []
  const seen = new Set()

  for (const stepText of stepTexts) {
    const resolved = resolveStepFn(stepText)
    const { flow, params } = resolved
    if (!flow) continue

    const key = flowRunKey(flow, params)
    if (seen.has(key)) continue
    seen.add(key)
    flowsToRun.push({ flow, params })
  }

  return flowsToRun
}

function pickleLabel(pickle, index, totalWithSameName) {
  if (totalWithSameName > 1) {
    return `"${pickle.name}" (#${index + 1})`
  }
  return `"${pickle.name}"`
}

module.exports = {
  parseFeature,
  getPickles,
  getPickleStepTexts,
  flowRunKey,
  buildFlowsFromSteps,
  pickleLabel,
  generateFeatureMessages,
}
