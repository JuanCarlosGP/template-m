import fs from 'fs'
import path from 'path'
import { generateMessages } from '@cucumber/gherkin'
import { IdGenerator } from '@cucumber/messages'
import { resolveStep, resolveMaestroFlowFile } from '../../step-definitions/index.js'
import { scenariosInFeature } from './gherkin-scenarios.js'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Compose Gherkin-mapped Maestro flows into a thin YAML that only `runFlow`s
 * existing files (no inlined bodies). Nested `file:` inside those YAMLs still
 * resolve relative to the YAML that declares them.
 *
 * One composer per .feature. Repeated flow ids stay as separate runFlows so
 * the same flow can run twice with different env.
 */

const REPO_ROOT = path.join(__dirname, '..', '..', '..')
const DEFAULT_FEATURES_DIR = path.join(REPO_ROOT, 'maestro', 'features')
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'maestro', '.tmp', 'scenarios')

function parseGherkinFeature(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8')
  const messages = generateMessages(source, filePath, 'text/x.cucumber.gherkin+plain' as any, {
    newId: IdGenerator.uuid(),
    includeGherkinDocument: true,
    includePickles: false,
  })
  const parseError = messages.find(m => m.parseError)
  if (parseError) throw new Error(`Parse error: ${parseError.parseError.message}`)
  const docMessage = messages.find(m => m.gherkinDocument)
  if (!docMessage) throw new Error(`No gherkin document found in: ${filePath}`)
  return docMessage.gherkinDocument
}

function posixRel(fromDir, toFile) {
  return path.relative(fromDir, toFile).split(path.sep).join('/')
}

function yamlDoubleQuoted(value) {
  return `"${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')}"`
}

function composerStem(featurePath) {
  return path.basename(featurePath, '.feature')
}

function composerRelPath(featurePath) {
  return `.tmp/scenarios/${composerStem(featurePath)}.yml`
}

function scenarioSlug(scenarioName) {
  const slug = String(scenarioName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'scenario'
}

/** One file per scenario, so a BrowserStack upload does not bundle the whole feature. */
function scenarioComposerStem(featurePath, scenarioName) {
  return `${composerStem(featurePath)}_${scenarioSlug(scenarioName)}`
}

function scenarioComposerRelPath(featurePath, scenarioName) {
  return `.tmp/scenarios/${scenarioComposerStem(featurePath, scenarioName)}.yml`
}

function walkFeatureScenarios(featurePath, deps = undefined) {
  const resolve = (deps && deps.resolveStep) || resolveStep
  const resolveFile = (deps && deps.resolveMaestroFlowFile) || resolveMaestroFlowFile
  const doc = parseGherkinFeature(featurePath)
  const feature = doc.feature
  if (!feature) throw new Error(`No feature in: ${featurePath}`)

  const scenarios = []
  for (const scenario of scenariosInFeature(feature)) {
    const flows = []
    for (const step of scenario.steps || []) {
      const { flow, params } = resolve(step.text)
      if (!flow) continue
      const absPath = resolveFile(flow)
      if (!absPath) {
        throw new Error(`Flow file not found for "${flow}" (expected under maestro/shared/)`)
      }
      flows.push({ id: flow, absPath, params: params || {} })
    }
    scenarios.push({ name: scenario.name, flows })
  }
  return scenarios
}

/**
 * Ordered Maestro flow entries for every scenario in the feature.
 * Does not de-duplicate: the same flow id with different params is two runFlows.
 * @param {string} featurePath
 * @param {{ resolveStep?: Function, resolveMaestroFlowFile?: Function }} [deps]
 */
function collectFlowsFromFeature(featurePath, deps = undefined) {
  const scenarios = walkFeatureScenarios(featurePath, deps)
  return {
    name: composerStem(featurePath),
    featurePath,
    flows: scenarios.flatMap(scenario => scenario.flows),
  }
}

function renderRunFlowBlock(dir, { absPath, params }) {
  const rel = posixRel(dir, absPath)
  const fileLine = `    file: ${yamlDoubleQuoted(rel)}`
  const p = params && Object.keys(params).length > 0 ? params : null
  if (!p) return `- runFlow:\n${fileLine}`
  const envLines = Object.keys(p).sort().map(k => `      ${k}: ${yamlDoubleQuoted(p[k])}`)
  return `- runFlow:\n${fileLine}\n    env:\n${envLines.join('\n')}`
}

function renderComposerYaml({ name, composerAbsPath, flows }) {
  const dir = path.dirname(composerAbsPath)
  const steps = flows.map(f => renderRunFlowBlock(dir, f))
  return [
    `appId: \${APP_ID}`,
    `name: ${yamlDoubleQuoted(name)}`,
    `---`,
    `# Generated composer — runFlow file: only. Do not edit; regenerate.`,
    ...steps,
    '',
  ].join('\n')
}

function normalizeFlowEntry(f) {
  if (typeof f === 'string') {
    const absPath = resolveMaestroFlowFile(f)
    if (!absPath) throw new Error(`Flow file not found for "${f}"`)
    return { id: f, absPath, params: {} }
  }
  if (!f.absPath) {
    const absPath = resolveMaestroFlowFile(f.id || f.flow)
    if (!absPath) throw new Error(`Flow file not found for "${f.id || f.flow}"`)
    return { id: f.id || f.flow, absPath, params: f.params || {} }
  }
  return { id: f.id || f.flow, absPath: f.absPath, params: f.params || {} }
}

function writeComposerFromFlows({ name, flows, outDir }) {
  const destDir = path.resolve(outDir || DEFAULT_OUT_DIR)
  fs.mkdirSync(destDir, { recursive: true })
  const composerAbsPath = path.join(destDir, `${name}.yml`)
  const normalized = (flows || []).map(normalizeFlowEntry)
  if (!normalized.length) {
    throw new Error(`No Maestro flows to compose for "${name}"`)
  }
  const yaml = renderComposerYaml({ name, composerAbsPath, flows: normalized })
  fs.writeFileSync(composerAbsPath, yaml, 'utf-8')
  return composerAbsPath
}

function writeFeatureComposer(featurePath, outDir) {
  const collected = collectFlowsFromFeature(featurePath)
  return {
    ...collected,
    composerPath: writeComposerFromFlows({
      name: collected.name,
      flows: collected.flows,
      outDir,
    }),
  }
}

function listFeatureFiles(featuresDir) {
  const dir = path.resolve(featuresDir || DEFAULT_FEATURES_DIR)
  if (!fs.existsSync(dir)) {
    throw new Error(`Feature directory not found: ${dir}`)
  }
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.feature'))
    .sort()
    .map(f => path.join(dir, f))
}

function cleanComposerDir(outDir) {
  const destDir = path.resolve(outDir || DEFAULT_OUT_DIR)
  if (!fs.existsSync(destDir)) return destDir
  for (const entry of fs.readdirSync(destDir)) {
    if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
      fs.unlinkSync(path.join(destDir, entry))
    }
  }
  return destDir
}

function writeScenarioComposer(featurePath, scenarioName, flows, outDir) {
  const name = scenarioComposerStem(featurePath, scenarioName)
  return {
    name: scenarioName,
    featurePath,
    stem: name,
    flows,
    composerPath: writeComposerFromFlows({ name, flows, outDir }),
    relPath: scenarioComposerRelPath(featurePath, scenarioName),
  }
}

/**
 * One YAML per scenario for a single feature. Drops that feature's previous
 * composers (the old combined file and earlier scenario files) and leaves the rest.
 */
function writeFeatureScenarioComposers(featurePath, outDir, deps = undefined) {
  const destDir = path.resolve(outDir || DEFAULT_OUT_DIR)
  fs.mkdirSync(destDir, { recursive: true })
  const stem = composerStem(featurePath)
  for (const entry of fs.readdirSync(destDir)) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue
    const base = entry.replace(/\.ya?ml$/, '')
    if (base === stem || base.startsWith(`${stem}_`)) {
      fs.unlinkSync(path.join(destDir, entry))
    }
  }
  const written = []
  for (const scenario of walkFeatureScenarios(featurePath, deps)) {
    if (!scenario.flows.length) continue
    written.push(writeScenarioComposer(featurePath, scenario.name, scenario.flows, destDir))
  }
  if (!written.length) {
    throw new Error(`No Maestro flows to compose for "${path.basename(featurePath)}"`)
  }
  return written
}

/**
 * One composer YAML per Gherkin scenario. BrowserStack zips this directory
 * once, so each scenario must already have its own file.
 */
function writeAllScenarioComposers(featuresDir, outDir, deps = undefined) {
  const destDir = cleanComposerDir(outDir)
  const written = []
  for (const featurePath of listFeatureFiles(featuresDir)) {
    for (const scenario of walkFeatureScenarios(featurePath, deps)) {
      if (!scenario.flows.length) continue
      written.push(writeScenarioComposer(featurePath, scenario.name, scenario.flows, destDir))
    }
  }
  return written
}

/**
 * Fallback when the Maestro command log cannot say which runFlow failed.
 * Passed steps stay green with no duration. A failure stays on the scenario;
 * steps are `unknown` (visor: "sin dato") instead of blaming the first one.
 */
function compositeFlowResults(flows, { passed }) {
  return (flows || []).map(({ flow, params }) => ({
    flow,
    title: flow,
    params: params || {},
    status: passed ? 'passed' : 'unknown',
    durationMs: null,
    error: null,
  }))
}

function writeWorkspaceConfig(outDir) {
  const destDir = path.resolve(outDir || DEFAULT_OUT_DIR)
  fs.mkdirSync(destDir, { recursive: true })
  const configPath = path.join(path.dirname(destDir), 'composed-workspace.yaml')
  fs.writeFileSync(
    configPath,
    [
      '# Generated for .tmp/scenarios/*.yml — no flowsOrder (unlike maestro/config.yaml).',
      'executionOrder:',
      '  continueOnFailure: false',
      '',
    ].join('\n'),
    'utf-8',
  )
  return configPath
}

export { REPO_ROOT, DEFAULT_FEATURES_DIR, DEFAULT_OUT_DIR, parseGherkinFeature, collectFlowsFromFeature, renderComposerYaml, writeComposerFromFlows, writeFeatureComposer, writeFeatureScenarioComposers, writeAllScenarioComposers, cleanComposerDir, listFeatureFiles, compositeFlowResults, writeWorkspaceConfig, composerStem, composerRelPath, scenarioComposerStem, scenarioComposerRelPath, posixRel, yamlDoubleQuoted }
