'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { MaestroStepRenderer, resetMaestroOutputSession } = require('./maestro-output')

describe('MaestroStepRenderer', () => {
  beforeEach(() => {
    resetMaestroOutputSession()
  })
  it('transforms box steps from pending to running to passed', () => {
    const r = new MaestroStepRenderer()
    r.flowName = 'DemoOnboarding'

    r.frameSteps.push({ indent: 3, marker: '?', label: 'Launch app "com.example"' })
    r.frameSteps.push({ indent: 3, marker: '?', label: 'Assert that "Home" is visible' })
    const frame1 = r.flushFrame()
    assert.match(frame1, /⏳   Launch app/)
    assert.match(frame1, /⬛   Assert that/)
    assert.match(frame1, /> Flow: DemoOnboarding/)

    r.frameSteps.push({ indent: 3, marker: '✓', label: 'Launch app "com.example"' })
    r.frameSteps.push({ indent: 3, marker: '?', label: 'Assert that "Home" is visible' })
    const frame2 = r.flushFrame()
    assert.match(frame2, /✅   Launch app/)
    assert.match(frame2, /⏳   Assert that/)
  })

  it('merges Launch app placeholder and resolved app id into one step', () => {
    const r = new MaestroStepRenderer()
    r.flowName = 'DemoOnboarding'

    r.frameSteps.push({ indent: 3, marker: '?', label: 'Launch app "${APP_ID}"' })
    r.flushFrame()
    r.frameSteps.push({ indent: 3, marker: '✓', label: 'Launch app "com.saucelabs.mydemoapp.android"' })
    const out = r.flushFrame()

    assert.equal((out.match(/Launch app/g) || []).length, 1)
    assert.match(out, /✅   Launch app "com.saucelabs.mydemoapp.android"/)
  })

  it('transforms Windows fallback box lines with ? borders', () => {
    const r = new MaestroStepRenderer()
    r.processLine(' ?  > Flow: DemoOnboarding')
    r.processLine(' ?    ?   Run ../android/DemoOnboarding.yml when Platform is ANDROID')
    const out = r.flushFrame()
    assert.match(out, / ║/)
    assert.match(out, /⏳/)
    assert.match(out, /Run \.\.\/android/)
  })

  it('reconstructs box UI from plain Maestro output', () => {
    const r = new MaestroStepRenderer()
    assert.equal(r.processLine('Running on device-1'), '  Device    device-1\n')
    assert.equal(r.processLine('Running on device-1'), '')

    r.processLine(' > Flow DemoOnboarding')
    const running = r.processLine('Run ../android/DemoOnboarding.yml when Platform is ANDROID...')
    assert.match(running, / ║/)
    assert.match(running, /⏳/)
    assert.doesNotMatch(running, /COMPLETED/)

    const done = r.processLine('  Launch app "${APP_ID}"... COMPLETED')
    assert.match(done, /✅/)
    assert.doesNotMatch(done, /COMPLETED/)
  })

  it('marks failed steps', () => {
    const r = new MaestroStepRenderer()
    r.flowName = 'Demo'
    r.frameSteps.push({ indent: 2, marker: 'X', label: 'Assert that "Missing" is visible' })
    const out = r.flushFrame()
    assert.match(out, /❌/)
  })

  it('marks collapsed child steps as passed when they disappear from the frame', () => {
    const r = new MaestroStepRenderer()
    r.flowName = 'Demo'
    r.frameSteps.push({ indent: 2, marker: '?', label: 'Run ../android/DemoOnboarding.yml when Platform is ANDROID' })
    r.frameSteps.push({ indent: 3, marker: '?', label: 'Launch app "com.example"' })
    r.flushFrame()

    r.frameSteps.push({ indent: 2, marker: '?', label: 'Run ../android/DemoOnboarding.yml when Platform is ANDROID' })
    const out = r.flushFrame()
    assert.match(out, /✅   Launch app/)
  })

  it('keeps inactive iOS platform branch pending until skipped', () => {
    const r = new MaestroStepRenderer({ liveRedraw: false })
    r.flowName = 'DemoOnboarding'
    r.steps.set('2|Run ../android/DemoOnboarding.yml when Platform is ANDROID', 'passed')

    r.frameSteps.push({ indent: 2, marker: '?', label: 'Run ../ios/DemoOnboarding.yml when Platform is IOS' })
    let out = r.flushFrame()
    assert.match(out, /⬛   Run \.\.\/ios/)
    assert.doesNotMatch(out, /⏳   Run \.\.\/ios/)

    r.frameSteps.push({
      indent: 2,
      marker: '-',
      label: 'Run ../ios/DemoOnboarding.yml when Platform is IOS (skipped)',
    })
    out = r.flushFrame()
    assert.match(out, /⬛   Run \.\.\/ios\/DemoOnboarding.yml when Platform is IOS \(skipped\)/)
  })

  it('seeds after Running on device to avoid broken live redraw', () => {
    const r = new MaestroStepRenderer({ liveRedraw: false, pendingPlan: {
      flowName: 'DemoBank',
      steps: [
        { indent: 1, label: 'Run ../shared/DemoBank.yml' },
        { indent: 2, label: 'Launch app "${APP_ID}"' },
      ],
    } })

    const out = r.processLine('Running on device-1')

    assert.match(out, /Device    device-1/)
    assert.match(r.lastBoxRender, /> Flow: DemoBank/)
    assert.match(r.lastBoxRender, /⏳   Run \.\.\/shared\/DemoBank\.yml/)
    assert.match(r.lastBoxRender, /⬛   Launch app/)
  })

  it('seeds the full step tree before Maestro output arrives', () => {
    const r = new MaestroStepRenderer({ liveRedraw: false })
    const out = r.seedPlan({
      flowName: 'DemoBank',
      steps: [
        { indent: 1, label: 'Run ../shared/DemoBank.yml' },
        { indent: 2, label: 'Launch app "${APP_ID}"' },
        { indent: 2, label: 'Assert that "LOGIN" is visible' },
      ],
    })

    assert.match(out, /> Flow: DemoBank/)
    assert.match(out, /⏳   Run \.\.\/shared\/DemoBank\.yml/)
    assert.match(out, /⬛   Launch app/)
    assert.match(out, /⬛   Assert that "LOGIN"/)
  })

  it('advances running icon step by step on plain Maestro output', () => {
    const r = new MaestroStepRenderer({ liveRedraw: false })
    r.processLine(' > Flow DemoOnboarding')
    let out = r.processLine('Run ../android/DemoOnboarding.yml when Platform is ANDROID...')
    assert.match(out, /⏳   Run \.\.\/android/)

    out = r.processLine('  Launch app "com.saucelabs.mydemoapp.android"...')
    assert.match(out, /⏳   Launch app/)

    out = r.processLine('  Assert that "The Practice App" is visible...')
    assert.match(out, /✅   Launch app/)
    assert.match(out, /⏳   Assert that "The Practice App"/)

    out = r.processLine('  Assert that "The Practice App" is visible... COMPLETED')
    assert.match(out, /✅   Assert that "The Practice App"/)
  })

  it('hides unexecuted exclusive conditional branches at the end', () => {
    const r = new MaestroStepRenderer({ liveRedraw: false })
    r.seedPlan({
      flowName: 'DemoBank',
      steps: [
        { indent: 2, label: 'Run flow when "Your balance is:" is visible' },
        { indent: 3, label: 'Assert that "Your balance is:" is visible' },
        { indent: 2, label: 'Run flow when "Invalid username or password!" is visible' },
        { indent: 3, label: 'Tap on "CLOSE"' },
      ],
    })

    r.steps.set('2|Run flow when "Your balance is:" is visible', 'passed')
    r.steps.set('3|Assert that "Your balance is:" is visible', 'passed')
    const out = r.finalizeExclusiveBranches()

    assert.match(out, /Your balance is:/)
    assert.doesNotMatch(out, /Invalid username or password/)
    assert.doesNotMatch(out, /Tap on "CLOSE"/)
  })

  it('marks BANK_EXPECT winner on successful flush when late frames are missing', () => {
    const r = new MaestroStepRenderer({ liveRedraw: false })
    r.seedPlan({
      flowName: 'DemoBank',
      steps: [
        { indent: 2, label: 'Tap on "LOGIN"' },
        { indent: 2, label: 'Run flow when false is true' },
        { indent: 3, label: 'Assert that "LOGOUT" is visible' },
        { indent: 2, label: 'Run flow when true is true' },
        { indent: 3, label: 'Assert that "Invalid username or password!" is visible' },
      ],
    })
    r.steps.set('2|Tap on "LOGIN"', 'passed')
    const out = r.flush({ success: true })

    assert.match(out, /Invalid username or password/)
    assert.doesNotMatch(out, /LOGOUT/)
  })
})
