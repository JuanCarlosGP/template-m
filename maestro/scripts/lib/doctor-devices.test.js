'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  parseAdbDevices,
  parseBootedIosSimulators,
  listConnectedDevices,
} = require('./doctor-devices')

describe('doctor-devices', () => {
  it('parseAdbDevices counts only device rows', () => {
    const out = [
      'List of devices attached',
      '192.168.1.45:42633\tdevice',
      'emulator-5554\toffline',
      '',
    ].join('\n')
    assert.equal(parseAdbDevices(out).length, 1)
    assert.deepEqual(parseAdbDevices(''), [])
  })

  it('parseBootedIosSimulators finds Booted lines', () => {
    const out = [
      '== Devices ==',
      'iPhone 15 (Booted)',
      'iPhone 14 (Shutdown)',
    ].join('\n')
    assert.equal(parseBootedIosSimulators(out).length, 1)
  })

  it('listConnectedDevices hasAny is false when empty', () => {
    const result = listConnectedDevices({ run: () => '' })
    assert.equal(result.hasAny, false)
    assert.equal(result.ios.length, 0)
    assert.equal(result.android.length, 0)
  })

  it('listConnectedDevices hasAny is true with android', () => {
    const result = listConnectedDevices({
      run: (cmd) => {
        if (cmd.startsWith('adb')) {
          return 'List of devices attached\nemulator-5554\tdevice\n'
        }
        return ''
      },
    })
    assert.equal(result.hasAny, true)
    assert.equal(result.android.length, 1)
  })
})
