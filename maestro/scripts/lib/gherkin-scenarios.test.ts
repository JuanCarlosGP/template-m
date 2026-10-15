import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { scenariosInFeature } from './gherkin-scenarios.js'
import { parseGherkinFeature, writeAllScenarioComposers, REPO_ROOT } from './compose-flows.js'

const CONTACT_YML = path.join(REPO_ROOT, 'maestro', 'shared', 'contact', 'Contact.yml')
const LOGIN_YML = path.join(REPO_ROOT, 'maestro', 'shared', 'login', 'Login.yml')

function texts(steps) {
  return steps.map(step => step.text)
}

describe('scenariosInFeature', () => {
  it('prepends a feature Background to every scenario', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gherkin-bg-'))
    const featurePath = path.join(dir, 'Login.feature')
    fs.writeFileSync(featurePath, [
      'Feature: Login',
      '  Background:',
      '    Given la app está lista',
      '  Scenario: Credenciales válidas',
      '    When entra',
      '  Scenario: Clave incorrecta',
      '    When falla',
      '',
    ].join('\n'))

    const scenarios = scenariosInFeature(parseGherkinFeature(featurePath).feature)
    assert.deepEqual(scenarios.map(s => s.name), ['Credenciales válidas', 'Clave incorrecta'])
    assert.deepEqual(texts(scenarios[0].steps), ['la app está lista', 'entra'])
    assert.deepEqual(texts(scenarios[1].steps), ['la app está lista', 'falla'])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('adds a Rule Background only to scenarios inside that Rule', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gherkin-rule-'))
    const featurePath = path.join(dir, 'Login.feature')
    fs.writeFileSync(featurePath, [
      'Feature: Login',
      '  Background:',
      '    Given la app está lista',
      '  Scenario: Fuera',
      '    When entra',
      '  Rule: Clave',
      '    Background:',
      '      Given el teclado está visible',
      '    Scenario: Dentro',
      '      When falla',
      '',
    ].join('\n'))

    const scenarios = scenariosInFeature(parseGherkinFeature(featurePath).feature)
    assert.deepEqual(texts(scenarios[0].steps), ['la app está lista', 'entra'])
    assert.deepEqual(texts(scenarios[1].steps), [
      'la app está lista',
      'el teclado está visible',
      'falla',
    ])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes the Background flow into each scenario composer', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gherkin-compose-'))
    const featuresDir = path.join(dir, 'features')
    const outDir = path.join(dir, 'out')
    fs.mkdirSync(featuresDir)
    fs.writeFileSync(path.join(featuresDir, 'Login.feature'), [
      'Feature: Login',
      '  Background:',
      '    Given prepara',
      '  Scenario: Credenciales válidas',
      '    When entra',
      '  Scenario: Clave incorrecta',
      '    When falla',
      '',
    ].join('\n'))

    const written = writeAllScenarioComposers(featuresDir, outDir, {
      resolveStep(text) {
        if (text === 'prepara') return { flow: 'harness/Ready', params: {} }
        if (text === 'entra') return { flow: 'login/Login', params: {} }
        if (text === 'falla') return { flow: 'login/LoginKO', params: {} }
        return { flow: null, params: {} }
      },
      resolveMaestroFlowFile(flow) {
        return flow === 'login/Login' ? LOGIN_YML : CONTACT_YML
      },
    })

    const ok = fs.readFileSync(written[0].composerPath, 'utf8')
    const ko = fs.readFileSync(written[1].composerPath, 'utf8')
    assert.match(ok, /Contact\.yml/)
    assert.ok(ok.indexOf('Contact.yml') < ok.indexOf('Login.yml'))
    assert.match(ko, /Contact\.yml/)
    assert.doesNotMatch(ko, /Login\.yml/)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
