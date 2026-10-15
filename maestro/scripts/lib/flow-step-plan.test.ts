import path from 'path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFlowStepPlan } from './flow-step-plan.js'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ROOT = path.resolve(__dirname, '..', '..')

describe('buildFlowStepPlan', () => {
  it('plans OpenApp with launch step', () => {
    const plan = buildFlowStepPlan(path.join(ROOT, 'shared', 'common', 'OpenApp.yml'), {
      platform: 'android',
      env: { APP_ID: 'com.saucelabs.mydemoapp.android' },
    })

    assert.equal(plan.flowName, 'OpenApp')
    assert.ok(plan.steps.some(step => step.label.includes('Launch app')))
  })

  it('plans AssertVisibleText', () => {
    const plan = buildFlowStepPlan(path.join(ROOT, 'shared', 'common', 'AssertVisibleText.yml'), {
      platform: 'android',
      env: { TEXT: 'Products', APP_ID: 'com.saucelabs.mydemoapp.android' },
    })

    assert.equal(plan.flowName, 'AssertVisibleText')
    assert.ok(plan.steps.some(step => step.label.includes('Assert that') && step.label.includes('visible')))
  })
})
