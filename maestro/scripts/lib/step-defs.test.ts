import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateStepDefinitionsFile, validateStepEntry, countCaptureGroups } from '../validate-step-defs.js'
import { resolveStep, resolveStepSafe } from '../../step-definitions/index.js'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('validate-step-defs', () => {
  it('countCaptureGroups counts regex groups', () => {
    assert.equal(countCaptureGroups('literal'), 0)
    assert.equal(countCaptureGroups('user "(.+)" pass "(.+)"'), 2)
    assert.equal(countCaptureGroups('(?:non-capturing) (.+)'), 1)
  })

  it('rejects entry with params but no capture groups', () => {
    const problems = validateStepEntry(
      { pattern: 'literal step', flow: 'Demo', params: ['X'] },
      'test.json',
      0,
    )
    assert.ok(problems.some(p => p.includes('no capture groups')))
  })

  it('rejects mismatched params count', () => {
    const problems = validateStepEntry(
      { pattern: 'user "(.+)"', flow: 'Demo', params: ['A', 'B'] },
      'test.json',
      0,
    )
    assert.ok(problems.some(p => p.includes('capture group')))
  })

  it('validates all step-definition JSON files', () => {
    const dir = path.join(__dirname, '..', '..', 'step-definitions')
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'schema.json')
    assert.ok(files.length > 0)
    for (const file of files) {
      const problems = validateStepDefinitionsFile(path.join(dir, file))
      assert.deepEqual(problems, [], file)
    }
  })

  it('invalid temp file fails validation', () => {
    const filePath = path.join(os.tmpdir(), `step-def-bad-${Date.now()}.json`)
    fs.writeFileSync(filePath, JSON.stringify({
      steps: [{ pattern: 'bad ((', flow: 'X', params: ['Y'] }],
    }))
    try {
      const problems = validateStepDefinitionsFile(filePath)
      assert.ok(problems.length > 0)
    } finally {
      fs.unlinkSync(filePath)
    }
  })
})

describe('demo step patterns (common / auth / webview / about)', () => {
  it('matches open app step', () => {
    const resolved = resolveStep('abro My Demo App en la pantalla principal')
    assert.equal(resolved.flow, 'common/OpenApp')
  })

  it('matches assert visible text step', () => {
    const resolved = resolveStep('veo el texto "Products"')
    assert.equal(resolved.flow, 'common/AssertVisibleText')
    assert.equal(resolved.params.TEXT, 'Products')
  })

  it('matches open menu and tap item step', () => {
    const resolved = resolveStep('abro el menú y pulso "Log In"')
    assert.equal(resolved.flow, 'common/TapMenuItem')
    assert.equal(resolved.params.MENU_ITEM, 'Log In')
  })

  it('does not match the old shorter menu wording', () => {
    assert.equal(resolveStepSafe('pulso "Log In" en el menú'), null)
  })

  it('matches login with credentials step', () => {
    const resolved = resolveStep('inicio sesión con usuario "bod@example.com" y contraseña "10203040"')
    assert.equal(resolved.flow, 'auth/LoginWithCredentials')
    assert.equal(resolved.params.USERNAME, 'bod@example.com')
    assert.equal(resolved.params.PASSWORD, '10203040')
  })

  it('matches confirm logout dialog step', () => {
    assert.equal(resolveStep('confirmo el logout en el diálogo').flow, 'auth/ConfirmLogoutDialog')
  })

  it('matches navigate to URL step', () => {
    const resolved = resolveStep('navego a la URL "https://www.wikipedia.org"')
    assert.equal(resolved.flow, 'webview/WebViewNavigateUrl')
    assert.equal(resolved.params.URL, 'https://www.wikipedia.org')
  })

  it('matches Sauce Labs website link step', () => {
    assert.equal(resolveStep('pulso el enlace al sitio de Sauce Labs').flow, 'about/TapSauceLabsWebsiteLink')
  })

  it('does not match unrelated text', () => {
    assert.equal(resolveStepSafe('inicio sesión sin credenciales'), null)
  })
})
