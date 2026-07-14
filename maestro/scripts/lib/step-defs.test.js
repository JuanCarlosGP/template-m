'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  validateStepDefinitionsFile,
  validateStepEntry,
  countCaptureGroups,
} = require('../validate-step-defs')
const { resolveStep, resolveStepSafe } = require('../../step-definitions/index')

describe('validate-step-defs', () => {
  it('countCaptureGroups counts regex groups', () => {
    assert.equal(countCaptureGroups('literal'), 0)
    assert.equal(countCaptureGroups('user "(.+)" pass "(.+)"'), 2)
    assert.equal(countCaptureGroups('(?:non-capturing) (.+)'), 1)
  })

  it('rejects entry with params but no capture groups', () => {
    const problems = validateStepEntry(
      { pattern: 'literal step', flow: 'Demo', params: ['X'] },
      'test.json',
      0,
    )
    assert.ok(problems.some(p => p.includes('no capture groups')))
  })

  it('rejects mismatched params count', () => {
    const problems = validateStepEntry(
      { pattern: 'user "(.+)"', flow: 'Demo', params: ['A', 'B'] },
      'test.json',
      0,
    )
    assert.ok(problems.some(p => p.includes('capture group')))
  })

  it('validates appium-practice.json', () => {
    const filePath = path.join(__dirname, '..', '..', 'step-definitions', 'appium-practice.json')
    const problems = validateStepDefinitionsFile(filePath)
    assert.deepEqual(problems, [])
  })

  it('invalid temp file fails validation', () => {
    const filePath = path.join(os.tmpdir(), `step-def-bad-${Date.now()}.json`)
    fs.writeFileSync(filePath, JSON.stringify({
      steps: [{ pattern: 'bad ((', flow: 'X', params: ['Y'] }],
    }))
    try {
      const problems = validateStepDefinitionsFile(filePath)
      assert.ok(problems.length > 0)
    } finally {
      fs.unlinkSync(filePath)
    }
  })
})

describe('appium-practice step patterns', () => {
  const loginStep =
    'entro en "12 EXPAND BANK" e inicio sesión con usuario "practice" y clave "practice"'

  it('matches parameterized expand bank login step', () => {
    const resolved = resolveStep(loginStep)
    assert.equal(resolved.flow, 'ExpandBankLoginForm')
    assert.equal(resolved.params.SECTION, '12 EXPAND BANK')
    assert.equal(resolved.params.USERNAME, 'practice')
    assert.equal(resolved.params.PASSWORD, 'practice')
  })

  it('does not match unrelated text', () => {
    assert.equal(resolveStepSafe('inicio sesión sin credenciales'), null)
  })

  it('matches counter section navigation step', () => {
    const resolved = resolveStep('entro en "01 COUNTER"')
    assert.equal(resolved.flow, 'TapAppSection')
    assert.equal(resolved.params.SECTION, '01 COUNTER')
  })

  it('matches counter increment step with vez/veces', () => {
    const once = resolveStep('pulso incrementar 1 vez')
    assert.equal(once.flow, 'CounterIncrement')
    assert.equal(once.params.TIMES, '1')

    const thrice = resolveStep('pulso incrementar 3 veces')
    assert.equal(thrice.flow, 'CounterIncrement')
    assert.equal(thrice.params.TIMES, '3')

    const dec = resolveStep('pulso decrementar 1 vez')
    assert.equal(dec.flow, 'CounterDecrement')
    assert.equal(dec.params.TIMES, '1')
  })

  it('matches webview navigation and assert steps', () => {
    const nav = resolveStep('navego en el WebView a "https://en.wikipedia.org/wiki/Main_Page"')
    assert.equal(nav.flow, 'WebViewNavigateUrl')
    assert.equal(nav.params.URL, 'https://en.wikipedia.org/wiki/Main_Page')

    const assertWeb = resolveStep('en el WebView veo el texto "Welcome to Wikipedia"')
    assert.equal(assertWeb.flow, 'AssertWebViewText')
    assert.equal(assertWeb.params.TEXT, 'Welcome to Wikipedia')

    assert.equal(resolveStep('pulso clear del WebView').flow, 'WebViewClear')
  })
})
