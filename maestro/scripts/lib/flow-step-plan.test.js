'use strict'

const path = require('path')
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildFlowStepPlan } = require('./flow-step-plan')

const ROOT = path.resolve(__dirname, '..', '..')

describe('buildFlowStepPlan', () => {
  it('plans ExpandBankOpenApp with launch step', () => {
    const plan = buildFlowStepPlan(path.join(ROOT, 'flows', 'ExpandBankOpenApp.yml'), {
      platform: 'android',
      env: { APP_ID: 'com.expandtesting.practice' },
    })

    assert.equal(plan.flowName, 'ExpandBankOpenApp')
    assert.ok(plan.steps.some(step => step.label.includes('Launch app')))
  })

  it('plans ExpandBankLoginForm with android field steps', () => {
    const plan = buildFlowStepPlan(path.join(ROOT, 'flows', 'ExpandBankLoginForm.yml'), {
      platform: 'android',
      env: {
        SECTION: '12 EXPAND BANK',
        USERNAME: 'practice',
        PASSWORD: 'practice',
        APP_ID: 'com.expandtesting.practice',
      },
    })

    assert.equal(plan.flowName, 'ExpandBankLoginForm')
    assert.ok(plan.steps.some(step => step.label.includes('Run ../android/ExpandBankLoginForm.yml when Platform is ANDROID')))
    assert.ok(plan.steps.some(step => step.label.includes('Tap on')))
    assert.ok(plan.steps.some(step => step.label.includes('usernameTextField')))
    assert.ok(plan.steps.some(step => step.label.includes('loginButton')))
  })

  it('plans AssertVisibleText via shared flow', () => {
    const plan = buildFlowStepPlan(path.join(ROOT, 'flows', 'AssertVisibleText.yml'), {
      platform: 'android',
      env: { TEXT: 'Logout', APP_ID: 'com.expandtesting.practice' },
    })

    assert.equal(plan.flowName, 'AssertVisibleText')
    assert.ok(plan.steps.some(step => step.label.includes('Assert that') && step.label.includes('visible')))
  })
})
