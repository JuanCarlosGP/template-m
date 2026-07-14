'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const {
  formatScenarioHeader,
  formatGherkinSteps,
  formatFlowLaunch,
  formatMaestroCommand,
  formatEnvPairs,
  maskEnvValue,
  isVerbose,
  isCompact,
} = require('./runner-output')

describe('runner-output', () => {
  /** @type {string | undefined} */
  let prevVerbose

  beforeEach(() => {
    prevVerbose = process.env.GHERKIN_RUNNER_VERBOSE
    delete process.env.GHERKIN_RUNNER_VERBOSE
    delete process.env.MAESTRO_VERBOSE
  })

  afterEach(() => {
    if (prevVerbose === undefined) delete process.env.GHERKIN_RUNNER_VERBOSE
    else process.env.GHERKIN_RUNNER_VERBOSE = prevVerbose
  })

  it('draws a scenario box with feature and platform meta', () => {
    const out = formatScenarioHeader('"DemoBankLoginFail — error"', {
      featureFile: 'DemoBank.feature',
      platform: 'android',
    })
    assert.match(out, /╭─ Scenario/)
    assert.match(out, /DemoBankLoginFail/)
    assert.match(out, /feature: DemoBank\.feature/)
    assert.match(out, /platform: android/)
  })

  it('formats gherkin steps with flow mapping', () => {
    const out = formatGherkinSteps([
      { keyword: 'Given', text: 'la app Practice está instalada', flow: null },
      { keyword: 'When', text: 'accedo con login incorrecto', flow: 'DemoBank' },
      { keyword: 'Then', text: 'veo el error', flow: null },
    ])
    assert.match(out, /Gherkin/)
    assert.match(out, /◌ Given.*en flow/)
    assert.match(out, /▶ When.*→ DemoBank/)
    assert.match(out, /◌ Then.*en flow/)
  })

  it('masks sensitive env values and omits platform from env line', () => {
    const pairs = formatEnvPairs({
      PLATFORM: 'android',
      BANK_EXPECT: 'error',
      USERNAME: 'bad',
      PASSWORD: 'secret',
    })
    assert.deepEqual(pairs, [
      'BANK_EXPECT=error',
      'PASSWORD=••••',
      'USERNAME=bad',
    ])
    assert.equal(maskEnvValue('PASSWORD', 'secret'), '••••')
  })

  it('prints one-line flow launch by default', () => {
    const out = formatFlowLaunch({
      flowName: 'DemoBank',
      flowFile: 'C:\\repo\\maestro\\flows\\DemoBank.yml',
      platform: 'android',
      env: { PLATFORM: 'android', APP_ID: 'com.app', BANK_EXPECT: 'error' },
    })
    assert.match(out, /▶ DemoBank/)
    assert.match(out, /BANK_EXPECT=error/)
    assert.doesNotMatch(out, /PLATFORM=android/)
    assert.doesNotMatch(out, /APP_ID=com\.app/)
    assert.doesNotMatch(out, /^  Maestro$/m)
  })

  it('prints full flow launch block when compact is off', () => {
    process.env.GHERKIN_RUNNER_COMPACT = '0'
    const out = formatFlowLaunch({
      flowName: 'DemoBank',
      flowFile: 'C:\\repo\\maestro\\flows\\DemoBank.yml',
      platform: 'android',
      env: { PLATFORM: 'android', BANK_EXPECT: 'error' },
    })
    assert.match(out, /Maestro/)
    assert.match(out, /Flow\s+DemoBank/)
    assert.match(out, /Platform\s+android/)
    assert.match(out, /BANK_EXPECT=error/)
    assert.doesNotMatch(out, /PLATFORM=android/)
  })

  it('prints full flow launch block in verbose mode', () => {
    process.env.GHERKIN_RUNNER_VERBOSE = '1'
    const out = formatFlowLaunch({
      flowName: 'DemoBank',
      flowFile: 'C:\\repo\\maestro\\flows\\DemoBank.yml',
      platform: 'android',
      env: { BANK_EXPECT: 'error' },
    })
    assert.match(out, /Maestro/)
    assert.match(out, /verbose/)
  })

  it('hides maestro CLI unless verbose', () => {
    assert.equal(
      formatMaestroCommand('C:\\maestro\\maestro.bat', ['test', 'flow.yml']),
      '',
    )
    process.env.GHERKIN_RUNNER_VERBOSE = '1'
    assert.ok(isVerbose())
    const out = formatMaestroCommand('C:\\maestro\\maestro.bat', ['test', 'flow.yml'])
    assert.match(out, /CLI/)
    assert.match(out, /maestro\.bat/)
  })
})
