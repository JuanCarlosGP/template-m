'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { resolveAzurePlanId, resolveAzureSuiteId } = require('./azure-env')

describe('azure-env', () => {
  const saved = {}

  beforeEach(() => {
    for (const key of [
      'AZURE_TEST_PLAN_ID',
      'AZURE_TEST_SUITE_ID',
      'PLAN_ID',
      'SUITE_ID',
    ]) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('resolveAzurePlanId prefers CLI over env', () => {
    process.env.AZURE_TEST_PLAN_ID = '100'
    process.env.PLAN_ID = '200'
    assert.equal(resolveAzurePlanId({ planId: '42' }), '42')
  })

  it('resolveAzurePlanId prefers AZURE_TEST_PLAN_ID over PLAN_ID', () => {
    process.env.AZURE_TEST_PLAN_ID = '100'
    process.env.PLAN_ID = '200'
    assert.equal(resolveAzurePlanId(), '100')
  })

  it('resolveAzurePlanId falls back to PLAN_ID', () => {
    process.env.PLAN_ID = '200'
    assert.equal(resolveAzurePlanId(), '200')
  })

  it('resolveAzureSuiteId prefers CLI over env', () => {
    process.env.AZURE_TEST_SUITE_ID = '10'
    process.env.SUITE_ID = '20'
    assert.equal(resolveAzureSuiteId({ suiteId: '5' }), '5')
  })

  it('resolveAzureSuiteId prefers AZURE_TEST_SUITE_ID over SUITE_ID', () => {
    process.env.AZURE_TEST_SUITE_ID = '10'
    process.env.SUITE_ID = '20'
    assert.equal(resolveAzureSuiteId(), '10')
  })

  it('resolveAzureSuiteId falls back to SUITE_ID', () => {
    process.env.SUITE_ID = '20'
    assert.equal(resolveAzureSuiteId(), '20')
  })
})
