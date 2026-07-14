'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  getPickles,
  getPickleStepTexts,
  flowRunKey,
  buildFlowsFromSteps,
} = require('./gherkin')

function writeTempFeature(content) {
  const filePath = path.join(os.tmpdir(), `gherkin-test-${Date.now()}-${Math.random().toString(36).slice(2)}.feature`)
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

describe('gherkin lib', () => {
  it('includes Background steps in each pickle', () => {
    const filePath = writeTempFeature(`Feature: Background test
  Background:
    Given la app demo está instalada
  Scenario: Con background
    When completo el onboarding inicial
`)
    try {
      const pickles = getPickles(filePath)
      assert.equal(pickles.length, 1)
      const texts = getPickleStepTexts(pickles[0])
      assert.ok(texts.includes('la app demo está instalada'))
      assert.ok(texts.includes('completo el onboarding inicial'))
    } finally {
      fs.unlinkSync(filePath)
    }
  })

  it('expands Scenario Outline into one pickle per example row', () => {
    const filePath = writeTempFeature(`Feature: Outline test
  Scenario Outline: Login parametrizado
    When inicio sesión con usuario "<user>" y clave "<pass>"
    Examples:
      | user      | pass      |
      | demo_user | demo_pass |
      | alt_user  | alt_pass  |
`)
    try {
      const pickles = getPickles(filePath)
      assert.equal(pickles.length, 2)
      const texts0 = getPickleStepTexts(pickles[0])
      const texts1 = getPickleStepTexts(pickles[1])
      assert.ok(texts0.some(t => t.includes('demo_user') && t.includes('demo_pass')))
      assert.ok(texts1.some(t => t.includes('alt_user') && t.includes('alt_pass')))
      assert.ok(!texts0.some(t => t.includes('<user>')))
    } finally {
      fs.unlinkSync(filePath)
    }
  })

  it('flowRunKey deduplicates same flow+params but not different params', () => {
    const keyA = flowRunKey('DemoLogin', { USERNAME: 'a', PASSWORD: 'b' })
    const keyB = flowRunKey('DemoLogin', { USERNAME: 'a', PASSWORD: 'b' })
    const keyC = flowRunKey('DemoLogin', { USERNAME: 'x', PASSWORD: 'y' })
    assert.equal(keyA, keyB)
    assert.notEqual(keyA, keyC)
  })

  it('buildFlowsFromSteps runs same flow twice when params differ', () => {
    const flows = buildFlowsFromSteps(
      [
        'inicio sesión con usuario "a" y clave "1"',
        'inicio sesión con usuario "b" y clave "2"',
      ],
      (text) => {
        const m = text.match(/inicio sesión con usuario "(.+)" y clave "(.+)"/)
        if (!m) throw new Error(`unexpected: ${text}`)
        return { flow: 'DemoLogin', params: { USERNAME: m[1], PASSWORD: m[2] } }
      },
    )
    assert.equal(flows.length, 2)
    assert.equal(flows[0].params.USERNAME, 'a')
    assert.equal(flows[1].params.USERNAME, 'b')
  })

  it('buildFlowsFromSteps deduplicates identical flow+params', () => {
    const flows = buildFlowsFromSteps(
      [
        'inicio sesión con usuario "a" y clave "1"',
        'inicio sesión con usuario "a" y clave "1"',
      ],
      (text) => {
        const m = text.match(/inicio sesión con usuario "(.+)" y clave "(.+)"/)
        return { flow: 'DemoLogin', params: { USERNAME: m[1], PASSWORD: m[2] } }
      },
    )
    assert.equal(flows.length, 1)
  })
})

describe('AppiumPracticeExpandBank.feature', () => {
  it('produces one executable pickle', () => {
    const filePath = path.join(__dirname, '..', '..', 'features', 'AppiumPracticeExpandBank.feature')
    const pickles = getPickles(filePath)
    assert.equal(pickles.length, 1)
  })
})
