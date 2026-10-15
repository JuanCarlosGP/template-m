import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { scenarioComposerStem, scenarioComposerRelPath, writeAllScenarioComposers, writeFeatureScenarioComposers, cleanComposerDir, REPO_ROOT } from './compose-flows.js'

const CONTACT_YML = path.join(REPO_ROOT, 'maestro', 'shared', 'contact', 'Contact.yml')
const LOGIN_YML = path.join(REPO_ROOT, 'maestro', 'shared', 'login', 'Login.yml')

describe('scenario composers', () => {
  it('names the file after the feature and the scenario', () => {
    const feature = path.join('maestro', 'features', 'Login.feature')
    assert.equal(
      scenarioComposerStem(feature, 'Usuario inicia sesión con credenciales válidas'),
      'Login_Usuario-inicia-sesion-con-credenciales-validas',
    )
    assert.equal(
      scenarioComposerRelPath(feature, 'Usuario introduce clave incorrecta'),
      '.tmp/scenarios/Login_Usuario-introduce-clave-incorrecta.yml',
    )
  })

  it('writes one YAML per scenario and does not mix their flows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-scenarios-'))
    const featuresDir = path.join(dir, 'features')
    const outDir = path.join(dir, 'out')
    fs.mkdirSync(featuresDir)
    fs.writeFileSync(path.join(featuresDir, 'Login.feature'), [
      'Feature: Login',
      '  Scenario: Usuario inicia sesión con credenciales válidas',
      '    When entra',
      '  Scenario: Usuario introduce clave incorrecta',
      '    When falla',
      '',
    ].join('\n'))

    const written = writeAllScenarioComposers(featuresDir, outDir, {
      resolveStep(text) {
        if (text === 'entra') return { flow: 'login/Login', params: {} }
        if (text === 'falla') return { flow: 'login/LoginKO', params: {} }
        return { flow: null, params: {} }
      },
      resolveMaestroFlowFile(flow) {
        return flow === 'login/LoginKO' ? LOGIN_YML : CONTACT_YML
      },
    })

    assert.deepEqual(written.map(w => path.basename(w.composerPath)), [
      'Login_Usuario-inicia-sesion-con-credenciales-validas.yml',
      'Login_Usuario-introduce-clave-incorrecta.yml',
    ])
    const ok = fs.readFileSync(written[0].composerPath, 'utf8')
    const ko = fs.readFileSync(written[1].composerPath, 'utf8')
    assert.match(ok, /Contact\.yml/)
    assert.doesNotMatch(ok, /Login\.yml/)
    assert.match(ko, /Login\.yml/)
    assert.doesNotMatch(ko, /Contact\.yml/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('drops leftover composer yaml and keeps other files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-clean-'))
    fs.writeFileSync(path.join(dir, 'OldFeature.yml'), 'old')
    fs.writeFileSync(path.join(dir, 'note.txt'), 'keep')
    cleanComposerDir(dir)
    assert.equal(fs.existsSync(path.join(dir, 'OldFeature.yml')), false)
    assert.equal(fs.readFileSync(path.join(dir, 'note.txt'), 'utf8'), 'keep')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes one YAML per scenario for a single feature and drops the old combined file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-one-feature-'))
    const featurePath = path.join(dir, 'Login.feature')
    fs.writeFileSync(featurePath, [
      'Feature: Login',
      '  Scenario: Usuario inicia sesión con credenciales válidas',
      '    When entra',
      '  Scenario: Usuario introduce clave incorrecta',
      '    When falla',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(dir, 'Login.yml'), 'combined')
    fs.writeFileSync(path.join(dir, 'Contact_hola.yml'), 'keep')

    const written = writeFeatureScenarioComposers(featurePath, dir, {
      resolveStep(text) {
        if (text === 'entra') return { flow: 'login/Login', params: {} }
        if (text === 'falla') return { flow: 'login/LoginKO', params: {} }
        return { flow: null, params: {} }
      },
      resolveMaestroFlowFile(flow) {
        return flow === 'login/LoginKO' ? LOGIN_YML : CONTACT_YML
      },
    })

    assert.equal(fs.existsSync(path.join(dir, 'Login.yml')), false)
    assert.equal(fs.readFileSync(path.join(dir, 'Contact_hola.yml'), 'utf8'), 'keep')
    assert.deepEqual(written.map(w => path.basename(w.composerPath)), [
      'Login_Usuario-inicia-sesion-con-credenciales-validas.yml',
      'Login_Usuario-introduce-clave-incorrecta.yml',
    ])
    const ok = fs.readFileSync(written[0].composerPath, 'utf8')
    const ko = fs.readFileSync(written[1].composerPath, 'utf8')
    assert.match(ok, /Contact\.yml/)
    assert.doesNotMatch(ok, /Login\.yml/)
    assert.match(ko, /Login\.yml/)
    assert.doesNotMatch(ko, /Contact\.yml/)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
