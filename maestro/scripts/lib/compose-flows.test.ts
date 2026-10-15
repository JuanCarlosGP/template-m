import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { collectFlowsFromFeature, renderComposerYaml, writeComposerFromFlows, writeFeatureComposer, writeWorkspaceConfig, posixRel, yamlDoubleQuoted, REPO_ROOT, DEFAULT_OUT_DIR } from './compose-flows.js'

const AUTH = path.join(REPO_ROOT, 'maestro', 'features', 'MyDemoAppAuth.feature')
const LOGIN_YML = path.join(REPO_ROOT, 'maestro', 'shared', 'auth', 'LoginWithCredentials.yml')
const CONTACT_YML = path.join(REPO_ROOT, 'maestro', 'shared', 'common', 'OpenApp.yml')

describe('compose-flows', () => {
  it('collects mapped area flows in Gherkin order and skips null steps', () => {
    const auth = collectFlowsFromFeature(AUTH)
    assert.equal(auth.name, 'MyDemoAppAuth')
    assert.deepEqual(auth.flows.map(f => f.id), [
      'common/OpenApp',
      'common/TapMenuItem',
      'auth/LoginWithCredentials',
      'common/TapMenuItem',
      'common/AssertVisibleText',
      'auth/ConfirmLogoutDialog',
      'common/AssertVisibleText',
    ])
    assert.equal(auth.flows[2].params.USERNAME, 'bod@example.com')
    assert.equal(auth.flows[2].params.PASSWORD, '10203040')
  })

  it('renders runFlow file: pointers without inlining nested YAML', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-yml-'))
    const composerAbsPath = path.join(tmp, 'Login.yml')
    const yaml = renderComposerYaml({
      name: 'Login',
      composerAbsPath,
      flows: [{
        id: 'auth/LoginWithCredentials',
        absPath: LOGIN_YML,
        params: { USERNAME: 'bod@example.com', PASSWORD: '10203040' },
      }],
    })
    assert.match(yaml, /^appId: \$\{APP_ID\}/m)
    assert.match(yaml, /name: "Login"/)
    assert.match(yaml, /runFlow:/)
    assert.match(yaml, /LoginWithCredentials\.yml/)
    assert.match(yaml, /USERNAME: "bod@example.com"/)
    assert.match(yaml, /PASSWORD: "10203040"/)
    assert.doesNotMatch(yaml, /tapOn:/)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('points at ../../shared from maestro/.tmp/scenarios/', () => {
    const yaml = renderComposerYaml({
      name: 'Contact',
      composerAbsPath: path.join(DEFAULT_OUT_DIR, 'Contact.yml'),
      flows: [{ id: 'contact/Contact', absPath: CONTACT_YML, params: {} }],
    })
    assert.match(yaml, /file: "\.\.\/\.\.\/shared\/common\/OpenApp\.yml"/)
  })

  it('escapes quotes inside a YAML double-quoted value', () => {
    assert.equal(yamlDoubleQuoted('a"b'), '"a\\"b"')
  })

  it('writes a composer whose path is relative to the output dir', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-out-'))
    const { composerPath, flows } = writeFeatureComposer(AUTH, tmp)
    const body = fs.readFileSync(composerPath, 'utf-8')
    const rel = yamlDoubleQuoted(posixRel(tmp, flows[0].absPath))
    assert.equal(path.basename(composerPath), 'MyDemoAppAuth.yml')
    assert.ok(body.includes(`file: ${rel}`))
    assert.ok(!body.includes('file: ../harness/'))
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('keeps the same flow twice when env differs', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-multi-'))
    const featurePath = path.join(tmp, 'TwoFlows.feature')
    fs.writeFileSync(featurePath, [
      'Feature: Two',
      '  Scenario: both',
      '    Given first step',
      '    When second step',
      '    And first step',
      '',
    ].join('\n'))
    const collected = collectFlowsFromFeature(featurePath, {
      resolveStep(text) {
        if (text === 'first step') {
          return { flow: 'login/Login', params: { USERNAME: 'A' } }
        }
        if (text === 'second step') return { flow: 'contact/Contact', params: {} }
        return { flow: null, params: {} }
      },
      resolveMaestroFlowFile(id) {
        if (id === 'login/Login') return LOGIN_YML
        if (id === 'contact/Contact') return CONTACT_YML
        return null
      },
    })
    assert.deepEqual(collected.flows.map(f => f.id), [
      'login/Login',
      'contact/Contact',
      'login/Login',
    ])
    const yaml = renderComposerYaml({
      name: 'TwoFlows',
      composerAbsPath: path.join(tmp, 'TwoFlows.yml'),
      flows: [
        { absPath: LOGIN_YML, params: { USERNAME: 'A' } },
        { absPath: CONTACT_YML, params: {} },
        { absPath: LOGIN_YML, params: { USERNAME: 'B' } },
      ],
    })
    assert.ok(yaml.indexOf('USERNAME: "A"') < yaml.indexOf('OpenApp.yml'))
    assert.ok(yaml.indexOf('OpenApp.yml') < yaml.indexOf('USERNAME: "B"'))
    assert.equal((yaml.match(/runFlow:/g) || []).length, 3)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('writeComposerFromFlows rejects an empty flow list', () => {
    assert.throws(
      () => writeComposerFromFlows({ name: 'Empty', flows: [], outDir: os.tmpdir() }),
      /No Maestro flows/,
    )
  })

  it('workspace config has no flowsOrder', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-ws-'))
    const composed = path.join(tmp, 'composed')
    fs.mkdirSync(composed)
    const configPath = writeWorkspaceConfig(composed)
    const body = fs.readFileSync(configPath, 'utf-8')
    assert.equal(path.basename(configPath), 'composed-workspace.yaml')
    assert.match(body, /continueOnFailure: false/)
    assert.doesNotMatch(body, /^\s*flowsOrder:/m)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
