import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { slugify, screenshotFileName, screenshotLabel, findNewestImage, collectScenarioScreenshot, flowEndsByClosingApp } from './capture-screenshot.js'

const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-shots-'))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('capture-screenshot', () => {
  it('slugify strips accents and punctuation', () => {
    assert.equal(slugify('Usuario inicia sesión'), 'usuario-inicia-sesion')
    assert.equal(slugify(''), 'scenario')
  })

  it('screenshotFileName is unique per kind and platform', () => {
    const at = new Date('2026-08-20T07:30:00.000Z')
    assert.equal(
      screenshotFileName({ platform: 'android', scenarioName: 'Login', kind: 'error', at }),
      'android-login-error-20260820T073000Z.png',
    )
  })

  it('screenshotLabel maps kind to Spanish caption', () => {
    assert.equal(screenshotLabel('final', 'passed'), 'Resultado final')
    assert.equal(screenshotLabel('error', 'failed'), 'En el error')
    assert.equal(screenshotLabel(undefined, 'failed'), 'En el error')
  })

  it('findNewestImage matches report-final inside screenshots/', () => {
    withTempDir((dir) => {
      const nested = path.join(dir, 'screenshots')
      fs.mkdirSync(nested, { recursive: true })
      const wanted = path.join(nested, 'report-final.png')
      fs.writeFileSync(wanted, MINI_PNG)
      fs.writeFileSync(path.join(nested, 'android-old-final.png'), MINI_PNG)

      const found = findNewestImage(dir, { sinceMs: 0, basename: 'report-final' })
      assert.equal(found, wanted)
    })
  })

  it('flowEndsByClosingApp detects trailing Home/stopApp', () => {
    withTempDir((dir) => {
      const closes = path.join(dir, 'closes.yml')
      fs.writeFileSync(closes, 'appId: x\n---\n- tapOn: "Ajustes"\n- takeScreenshot: report-final\n- pressKey: Home\n- stopApp\n')
      const open = path.join(dir, 'open.yml')
      fs.writeFileSync(open, 'appId: x\n---\n- assertVisible: "Hola,.*"\n- takeScreenshot: report-final\n')
      assert.equal(flowEndsByClosingApp(closes), true)
      assert.equal(flowEndsByClosingApp(open), false)
      assert.equal(flowEndsByClosingApp(path.join(dir, 'missing.yml')), false)
    })
  })

  it('collectScenarioScreenshot skips passed scenarios', () => {
    withTempDir((dir) => {
      const searchDir = path.join(dir, 'maestro-out')
      const reportDir = path.join(dir, 'report')
      fs.mkdirSync(path.join(searchDir, 'takeScreenshot'), { recursive: true })
      fs.writeFileSync(path.join(searchDir, 'takeScreenshot', 'report-final.png'), MINI_PNG)

      const rel = collectScenarioScreenshot({
        platform: 'android',
        scenarioName: 'Usuario inicia sesión',
        kind: 'final',
        reportDir,
        sinceMs: 0,
        searchDir,
        captureFn() { throw new Error('must not capture on pass') },
      })
      assert.equal(rel, null)
      assert.equal(fs.existsSync(path.join(reportDir, 'screenshots')), false)
    })
  })

  it('collectScenarioScreenshot captures the device on error', () => {
    withTempDir((dir) => {
      const reportDir = path.join(dir, 'report')
      const rel = collectScenarioScreenshot({
        platform: 'android',
        scenarioName: 'Contacto',
        kind: 'error',
        reportDir,
        sinceMs: Date.now(),
        searchDir: path.join(dir, 'empty'),
        captureFn(_platform, destPath) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true })
          fs.writeFileSync(destPath, MINI_PNG)
          return destPath
        },
      })
      assert.match(rel, /^screenshots\/android-contacto-error-/)
      assert.ok(fs.existsSync(path.join(reportDir, rel)))
    })
  })
})
