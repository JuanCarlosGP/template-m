'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { getRequestTimeoutMs } = require('./publish-results')

describe('publish-results', () => {
  const original = process.env.AZURE_REQUEST_TIMEOUT_MS

  beforeEach(() => {
    delete process.env.AZURE_REQUEST_TIMEOUT_MS
  })

  afterEach(() => {
    if (original === undefined) delete process.env.AZURE_REQUEST_TIMEOUT_MS
    else process.env.AZURE_REQUEST_TIMEOUT_MS = original
  })

  it('uses a 30 second timeout by default', () => {
    assert.equal(getRequestTimeoutMs(), 30000)
  })

  it('accepts a positive timeout from the environment', () => {
    process.env.AZURE_REQUEST_TIMEOUT_MS = '45000'
    assert.equal(getRequestTimeoutMs(), 45000)
  })

  it('falls back to the default for invalid values', () => {
    process.env.AZURE_REQUEST_TIMEOUT_MS = '-1'
    assert.equal(getRequestTimeoutMs(), 30000)
  })
})