'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildRunSummary, buildJUnitXml } = require('./write-reports')

const fixture = {
  startedAt: '2026-07-01T10:00:00.000Z',
  finishedAt: '2026-07-01T10:05:00.000Z',
  version: '0.3.0',
  perPlatform: [
    {
      platform: 'android',
      results: [
        { scenarioName: 'DemoLogin', status: 'passed', error: null, screenshotPath: null },
        {
          scenarioName: 'Login parametrizado (#1)',
          status: 'failed',
          error: 'Element not found',
          screenshotPath: '/tmp/shot.png',
        },
      ],
    },
  ],
}

describe('write-reports', () => {
  it('buildRunSummary aggregates pass/fail counts', () => {
    const summary = buildRunSummary(fixture)
    assert.equal(summary.template, 'izertis-maestro-template')
    assert.equal(summary.version, '0.3.0')
    assert.equal(summary.passed, 1)
    assert.equal(summary.failed, 1)
    assert.equal(summary.platforms[0].name, 'android')
    assert.equal(summary.platforms[0].results.length, 2)
  })

  it('buildJUnitXml produces valid structure', () => {
    const summary = buildRunSummary(fixture)
    const xml = buildJUnitXml(summary)
    assert.match(xml, /^<\?xml version="1.0"/)
    assert.match(xml, /<testsuites>/)
    assert.match(xml, /<testsuite name="android" tests="2" failures="1"/)
    assert.match(xml, /<testcase name="DemoLogin"\/>/)
    assert.match(xml, /<failure message="Element not found">/)
    assert.match(xml, /<\/testsuites>$/)
  })
})
