import test from 'node:test'
import assert from 'node:assert/strict'
import { attributeCompositeFlows, resolveCompositeFlowResults } from './attribute-composite.js'
import { buildStepReports } from './write-reports.js'

function ev(seq, src, status, duration, message = undefined) {
  return {
    command: { runFlowCommand: { sourceDescription: src } },
    metadata: {
      sequenceNumber: seq,
      status,
      duration,
      ...(message ? { error: { message } } : {}),
    },
  }
}

const flows = [
  { flow: 'Open', params: {}, fileRel: '../../shared/open/Open.yml' },
  { flow: 'Login', params: { MENU: 'a' }, fileRel: '../../shared/login/Login.yml' },
  { flow: 'Home', params: {}, fileRel: '../../shared/home/Home.yml' },
]

test('attributes the failed composer runFlow and leaves later steps interrupted', () => {
  const commands = [
    ev(2, '../../shared/open/Open.yml', 'COMPLETED', 1200),
    ev(8, '../harness/Helper.yml', 'FAILED', 50, 'nested helper'),
    ev(14, '../../shared/login/Login.yml', 'FAILED', 3400, 'Assertion is false: id: lk-login-form is visible'),
  ]
  const rows = attributeCompositeFlows(flows, commands)
  assert.deepEqual(rows.map(r => r.status), ['passed', 'failed', 'interrupted'])
  assert.equal(rows[0].durationMs, 1200)
  assert.equal(rows[1].durationMs, 3400)
  assert.equal(rows[1].error, 'Assertion is false: id: lk-login-form is visible')
  assert.equal(rows[1].params.MENU, 'a')
  assert.equal(rows[2].durationMs, 0)
  assert.equal(rows[2].error, null)

  const steps = buildStepReports(
    [
      { keyword: 'Given', text: 'open', flow: 'Open', params: {} },
      { keyword: 'When', text: 'login', flow: 'Login', params: { MENU: 'a' } },
      { keyword: 'Then', text: 'home', flow: 'Home', params: {} },
    ],
    rows,
  )
  assert.deepEqual(steps.map(s => s.status), ['passed', 'failed', 'interrupted'])
  assert.equal(steps[1].error, rows[1].error)
})

test('a full pass keeps each runFlow duration', () => {
  const commands = [
    ev(1, flows[0].fileRel, 'COMPLETED', 100),
    ev(2, flows[1].fileRel, 'COMPLETED', 200),
    ev(3, flows[2].fileRel, 'COMPLETED', 300),
  ]
  const rows = attributeCompositeFlows(flows, commands)
  assert.deepEqual(rows.map(r => [r.status, r.durationMs]), [
    ['passed', 100],
    ['passed', 200],
    ['passed', 300],
  ])
})

test('the same file twice is matched in order', () => {
  const repeated = [
    { flow: 'Tap', params: { N: '1' }, fileRel: '../../shared/tap/Tap.yml' },
    { flow: 'Tap', params: { N: '2' }, fileRel: '../../shared/tap/Tap.yml' },
  ]
  const rows = attributeCompositeFlows(repeated, [
    ev(1, repeated[0].fileRel, 'COMPLETED', 10),
    ev(4, repeated[0].fileRel, 'FAILED', 20, 'second tap'),
  ])
  assert.equal(rows[0].status, 'passed')
  assert.equal(rows[0].params.N, '1')
  assert.equal(rows[1].status, 'failed')
  assert.equal(rows[1].error, 'second tap')
})

test('an unreadable log falls back to sin dato', () => {
  assert.equal(attributeCompositeFlows(flows, []), null)
  assert.equal(attributeCompositeFlows(flows, [{ command: {}, metadata: { status: 'FAILED' } }]), null)
  const failed = resolveCompositeFlowResults(flows, null, { passed: false })
  assert.deepEqual(failed.map(r => r.status), ['unknown', 'unknown', 'unknown'])
  const passed = resolveCompositeFlowResults(flows, [], { passed: true })
  assert.deepEqual(passed.map(r => r.status), ['passed', 'passed', 'passed'])
  assert.ok(passed.every(r => r.durationMs == null))
})
