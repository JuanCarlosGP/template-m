'use strict'

const path = require('path')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildFlowStepPlan } = require('./flow-step-plan')

const ROOT = path.resolve(__dirname, '..', '..')

describe('buildFlowStepPlan', () => {
  it('plans OpenApp with launch step', () => {
    const plan = buildFlowStepPlan(path.join(ROOT, 'flows', 'OpenApp.yml'), {
      platform: 'android',
      env: { APP_ID: 'com.saucelabs.mydemoapp.android' },
    })

    assert.equal(plan.flowName, 'OpenApp')
    assert.ok(plan.steps.some(step => step.label.includes('Launch app')))
  })

  it('plans AssertVisibleText via shared flow', () => {
    const plan = buildFlowStepPlan(path.join(ROOT, 'flows', 'AssertVisibleText.yml'), {
      platform: 'android',
      env: { TEXT: 'Products', APP_ID: 'com.saucelabs.mydemoapp.android' },
    })

    assert.equal(plan.flowName, 'AssertVisibleText')
    assert.ok(plan.steps.some(step => step.label.includes('Assert that') && step.label.includes('visible')))
  })
})
