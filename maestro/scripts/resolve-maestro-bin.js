#!/usr/bin/env node
'use strict'

/**
 * Resuelve la ruta al CLI de Maestro para spawn/exec desde Node (npm no hereda siempre el mismo PATH).
 * Orden: MAESTRO_CLI / MAESTRO_PATH → which/where → ~/.maestro/bin o %USERPROFILE%\.maestro\bin.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env'),
})
const { execFileSync, spawn } = require('child_process')
const { MaestroStepRenderer } = require('./lib/maestro-output')

let cached = null

function firstExistingPath(lines) {
  for (const line of lines) {
    const p = line.trim()
    if (p && fs.existsSync(p)) return p
  }
  return null
}

function resolveFromPath() {
  const lookup = process.platform === 'win32' ? 'where' : 'which'
  try {
    const out = execFileSync(lookup, ['maestro'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim()
    return firstExistingPath(out.split(/\r?\n/))
  } catch (_) {
    return null
  }
}

function defaultMaestroCandidates() {
  const home = os.homedir()
  if (process.platform === 'win32') {
    return [
      path.join(home, 'maestro', 'bin', 'maestro.bat'),
      path.join(home, 'maestro', 'bin', 'maestro.cmd'),
      path.join(home, '.maestro', 'bin', 'maestro.bat'),
    ]
  }
  return [path.join(home, '.maestro', 'bin', 'maestro')]
}

function resolveMaestroBinary() {
  const fromEnv = process.env.MAESTRO_CLI || process.env.MAESTRO_PATH || process.env.MAESTRO_BINARY
  if (fromEnv) {
    if (fs.existsSync(fromEnv)) return fromEnv
    console.warn(`[resolve-maestro-bin] MAESTRO_CLI/MAESTRO_PATH/MAESTRO_BINARY no existe: ${fromEnv}`)
  }

  const fromPath = resolveFromPath()
  if (fromPath) return fromPath

  for (const p of defaultMaestroCandidates()) {
    if (fs.existsSync(p)) return p
  }

  return process.platform === 'win32' ? 'maestro.bat' : 'maestro'
}

/** Windows .bat: invocar vía cmd.exe para no partir argv con espacios (p. ej. TEXT=The Practice App). */
function buildMaestroSpawnInvocation(maestroBin, maestroArgs) {
  if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(maestroBin)) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', maestroBin, ...maestroArgs],
    }
  }
  return { command: maestroBin, args: maestroArgs }
}

/** Opciones spawn/exec sin shell (argv preservado). */
function getMaestroExecOptions(extra = {}) {
  return { shell: false, windowsHide: true, ...extra }
}

function getMaestroBinary() {
  if (!cached) cached = resolveMaestroBinary()
  return cached
}

function appendAndroidMaestroFlags(maestroArgs, platform) {
  if (platform !== 'android') return
  const serial = process.env.ANDROID_SERIAL || process.env.ANDROID_DEVICE_SERIAL
  if (serial) {
    maestroArgs.push('--device', serial)
  }
  if (/^(1|true|yes)$/i.test(process.env.MAESTRO_REINSTALL_DRIVER || '')) {
    maestroArgs.push('--reinstall-driver')
  }
}

function getMaestroWorkspaceDir() {
  return path.resolve(path.join(__dirname, '..'))
}

function rmQuiet(targetPath) {
  if (!fs.existsSync(targetPath)) return
  const st = fs.statSync(targetPath)
  if (st.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  } else {
    fs.unlinkSync(targetPath)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isMaestroSessionLockError(err) {
  const text = [err && err.message, err && err.stderr].filter(Boolean).join('\n')
  return /bloqueada una parte del archivo|locked a portion of the file|being used by another process/i.test(text)
}

function clearMaestroCliSessionStore(options = {}) {
  if (/^(1|true|yes)$/i.test(process.env.MAESTRO_KEEP_SESSION || '')) {
    return false
  }
  const base = path.join(os.homedir(), '.maestro')
  const candidates = [path.join(base, 'session'), path.join(base, 'sessions')]
  let cleared = false
  for (const sessionPath of candidates) {
    try {
      if (!fs.existsSync(sessionPath)) continue
      rmQuiet(sessionPath)
      cleared = true
      if (!options.quiet) {
        console.log(`[maestro] Sesión CLI reiniciada (eliminado: ${sessionPath}). Cierra Maestro Studio si sigue abierto.`)
      }
    } catch (e) {
      if (!options.quiet) {
        console.warn(`[maestro] No se pudo borrar ${sessionPath}: ${e.message}`)
      }
      throw e
    }
  }
  return cleared
}

async function clearMaestroCliSessionStoreWithRetry(options = {}) {
  const attempts = options.attempts ?? Number(process.env.MAESTRO_SESSION_CLEAR_RETRIES || 8)
  const delayMs = options.delayMs ?? Number(process.env.MAESTRO_SESSION_CLEAR_DELAY_MS || 400)
  const quiet = options.quiet ?? false
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const cleared = clearMaestroCliSessionStore({ quiet: quiet || attempt > 1 })
      return cleared
    } catch (err) {
      lastError = err
      if (attempt < attempts) await sleep(delayMs)
    }
  }
  if (lastError) throw lastError
  return false
}

async function prepareMaestroBetweenFlowRuns(options = {}) {
  if (/^(1|true|yes)$/i.test(process.env.MAESTRO_KEEP_SESSION || '')) {
    return { sessionCleared: false }
  }
  const defaultDelay = process.platform === 'win32' ? 1500 : 250
  const delayMs = Number(process.env.MAESTRO_BETWEEN_RUNS_MS ?? (options.forceDelay ? defaultDelay * 1.5 : defaultDelay))
  if (delayMs > 0) await sleep(delayMs)
  const sessionCleared = await clearMaestroCliSessionStoreWithRetry({ quiet: true })
  return { sessionCleared }
}

function prepareMaestroAndroidBeforeCliRun() {
  try {
    clearMaestroCliSessionStore()
  } catch (e) {
    console.warn(`[maestro] No se pudo limpiar sesión al inicio: ${e.message}`)
  }
}

function buildMaestroTestArgs(platform, maestroWorkspaceDir) {
  const ws = maestroWorkspaceDir || getMaestroWorkspaceDir()
  const maestroArgs = ['test']
  const configYaml = path.join(ws, 'config.yaml')
  if (fs.existsSync(configYaml)) {
    maestroArgs.push('--config', configYaml)
  }
  maestroArgs.push('-p', platform)
  appendAndroidMaestroFlags(maestroArgs, platform)
  return { maestroArgs, cwd: ws }
}

function formatMaestroEnvArg(key, value) {
  return `${key}=${String(value)}`
}

function appendMaestroEnvArgs(maestroArgs, env) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined || v === null) continue
    maestroArgs.push('--env', formatMaestroEnvArg(k, v))
  }
}

function withMaestroCliOutputFlags(maestroArgs) {
  if (maestroArgs.includes('--ansi') || maestroArgs.includes('--no-ansi')) {
    return maestroArgs
  }
  const useAnsi = process.env.MAESTRO_ANSI === '1'
    || (process.env.MAESTRO_ANSI !== '0' && process.platform !== 'win32')
  const flag = useAnsi ? '--ansi' : '--no-ansi'
  const args = [...maestroArgs]
  const testIdx = args.indexOf('test')
  if (testIdx === -1) {
    args.unshift(flag)
  } else {
    args.splice(testIdx + 1, 0, flag)
  }
  return args
}

const MAESTRO_SESSION_LOCK_LINE = /bloqueada una parte del archivo|locked a portion of the file/i
const MAESTRO_SESSION_STACK_LINE = /^\s+at (?:java\.base\/|kotlin\.|maestro\.cli\.)/

function filterMaestroStderrChunk(chunk, state) {
  let out = ''
  for (const line of String(chunk).split(/\r?\n/)) {
    if (/Exception in thread "Thread-\d+" java\.io\.IOException/.test(line) || MAESTRO_SESSION_LOCK_LINE.test(line)) {
      state.suppressStack = true
      continue
    }
    if (state.suppressStack) {
      if (line.trim() === '' || MAESTRO_SESSION_STACK_LINE.test(line)) continue
      state.suppressStack = false
    }
    if (line.length > 0) out += `${line}\n`
  }
  return out
}

function shouldLiveRedrawBox(extraOpts) {
  if (extraOpts && extraOpts.liveRedraw === false) return false
  if (extraOpts && extraOpts.liveRedraw === true) return true
  if (process.env.MAESTRO_LIVE_BOX === '0') return false
  if (process.env.MAESTRO_LIVE_BOX === '1') return true
  return true
}

function parseMaestroEnvArg(raw) {
  const eq = raw.indexOf('=')
  if (eq === -1) return null
  const key = raw.slice(0, eq)
  let value = raw.slice(eq + 1)
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replace(/\\"/g, '"')
  }
  return { key, value }
}

function extractMaestroRunContext(maestroArgs, extra) {
  const cwd = extra.cwd || getMaestroWorkspaceDir()
  const platformIdx = maestroArgs.indexOf('-p')
  const platform = platformIdx !== -1 ? maestroArgs[platformIdx + 1] : extra.platform

  /** @type {Record<string, string>} */
  const env = { ...(extra.env || {}) }
  for (let i = 0; i < maestroArgs.length; i++) {
    if (maestroArgs[i] !== '--env' || !maestroArgs[i + 1]) continue
    const parsed = parseMaestroEnvArg(maestroArgs[i + 1])
    if (parsed) env[parsed.key] = parsed.value
  }

  let flowFile = extra.flowFile
  if (!flowFile) {
    const ymlArg = [...maestroArgs].reverse().find(arg => /\.ya?ml$/i.test(arg))
    if (ymlArg) {
      flowFile = path.isAbsolute(ymlArg) ? ymlArg : path.resolve(cwd, ymlArg)
    }
  }

  return { platform, env, flowFile, cwd }
}

function maybeBuildRendererPlan(maestroArgs, extra) {
  if (extra.seedPlan === false) return null
  const { platform, env, flowFile } = extractMaestroRunContext(maestroArgs, extra)
  if (!flowFile || !fs.existsSync(flowFile)) return null

  try {
    const { buildFlowStepPlan } = require('./lib/flow-step-plan')
    return buildFlowStepPlan(flowFile, { platform, env })
  } catch (_) {
    return null
  }
}

/** Ejecuta el CLI de Maestro desde Node (stdout en streaming para progreso paso a paso). */
function execMaestroSync(maestroArgs, extraOpts) {
  const maestroBin = getMaestroBinary()
  const extra = extraOpts || {}
  const env = { ...process.env, ...(extra.env || {}) }
  const useStepIcons = extra.stepIcons !== false

  if (!useStepIcons) {
    const { command, args } = buildMaestroSpawnInvocation(maestroBin, maestroArgs)
    execFileSync(command, args, getMaestroExecOptions({
      stdio: 'inherit',
      ...extra,
      env,
    }))
    return Promise.resolve()
  }

  const args = withMaestroCliOutputFlags(maestroArgs)
  const pendingPlan = maybeBuildRendererPlan(maestroArgs, extra)
  const renderer = new MaestroStepRenderer({
    liveRedraw: shouldLiveRedrawBox(extra),
    pendingPlan,
  })

  const { command, args: spawnArgs } = buildMaestroSpawnInvocation(maestroBin, args)

  return new Promise((resolve, reject) => {
    const previousNoDeprecation = process.noDeprecation
    process.noDeprecation = true
    const child = spawn(command, spawnArgs, getMaestroExecOptions({
      cwd: extra.cwd,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    }))

    let stderr = ''
    const stderrFilterState = { suppressStack: false }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      process.stdout.write(renderer.process(chunk))
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
      const filtered = filterMaestroStderrChunk(chunk, stderrFilterState)
      if (filtered) process.stderr.write(filtered)
    })

    child.on('error', reject)
    child.on('close', code => {
      process.noDeprecation = previousNoDeprecation
      const success = code === 0
      process.stdout.write(renderer.flush({ success }))
      if (!success) {
        const err = new Error(`Maestro exited with code ${code}`)
        err.status = code
        err.stderr = stderr
        reject(err)
        return
      }
      resolve()
    })
  })
}

module.exports = {
  getMaestroBinary,
  resolveMaestroBinary,
  getMaestroExecOptions,
  execMaestroSync,
  appendMaestroEnvArgs,
  formatMaestroEnvArg,
  appendAndroidMaestroFlags,
  getMaestroWorkspaceDir,
  clearMaestroCliSessionStore,
  clearMaestroCliSessionStoreWithRetry,
  prepareMaestroBetweenFlowRuns,
  isMaestroSessionLockError,
  prepareMaestroAndroidBeforeCliRun,
  buildMaestroTestArgs,
}
