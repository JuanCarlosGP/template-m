'use strict'

/**
 * Device discovery helpers for doctor / agent preflight.
 * Pure parsing + injectable runners so unit tests need no adb/xcrun.
 */

function parseAdbDevices(output) {
  if (!output || typeof output !== 'string') return []
  return output
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim())
    .filter(line => /\bdevice\b/.test(line))
}

function parseBootedIosSimulators(output) {
  if (!output || typeof output !== 'string') return []
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.includes('(Booted)'))
}

/**
 * @param {{ run?: (cmd: string) => string|null }} [opts]
 * @returns {{ ios: string[], android: string[], hasAny: boolean }}
 */
function listConnectedDevices(opts = {}) {
  const run = opts.run || (() => null)
  const ios = parseBootedIosSimulators(run('xcrun simctl list devices booted') || '')
  const android = parseAdbDevices(run('adb devices') || '')
  return {
    ios,
    android,
    hasAny: ios.length > 0 || android.length > 0,
  }
}

module.exports = {
  parseAdbDevices,
  parseBootedIosSimulators,
  listConnectedDevices,
}
