'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { isMaestroSessionLockError } = require('../resolve-maestro-bin')

describe('resolve-maestro-bin', () => {
  it('detects Windows session lock errors in Spanish', () => {
    const err = new Error('Maestro exited with code 1')
    err.stderr = 'El proceso no tiene acceso al archivo porque otro proceso tiene bloqueada una parte del archivo'
    assert.equal(isMaestroSessionLockError(err), true)
  })

  it('detects session lock errors in English', () => {
    const err = new Error('being used by another process')
    assert.equal(isMaestroSessionLockError(err), true)
  })

  it('returns false for unrelated Maestro failures', () => {
    const err = new Error('Maestro exited with code 1')
    err.stderr = 'Element not found: LOGIN'
    assert.equal(isMaestroSessionLockError(err), false)
  })
})
