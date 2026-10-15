import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { useCompositeFlows } from './composite-mode.js'

describe('useCompositeFlows', () => {
  it('composes unless --per-flow or MAESTRO_PER_FLOW is set', () => {
    assert.equal(useCompositeFlows(), true)
    assert.equal(useCompositeFlows({ perFlow: false, env: {} }), true)
    assert.equal(useCompositeFlows({ env: { MAESTRO_PER_FLOW: '0' } }), true)
    assert.equal(useCompositeFlows({ env: { MAESTRO_PER_FLOW: 'false' } }), true)
  })

  it('turns compose off from the flag or the env var', () => {
    assert.equal(useCompositeFlows({ perFlow: true }), false)
    assert.equal(useCompositeFlows({ env: { MAESTRO_PER_FLOW: '1' } }), false)
    assert.equal(useCompositeFlows({ env: { MAESTRO_PER_FLOW: 'true' } }), false)
    assert.equal(useCompositeFlows({ env: { MAESTRO_PER_FLOW: 'YES' } }), false)
    assert.equal(useCompositeFlows({ perFlow: true, env: {} }), false)
  })
})
