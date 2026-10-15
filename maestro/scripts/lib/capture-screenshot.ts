import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const MAESTRO_SHOT_BASENAME = 'report-final'

function slugify(text) {
  const slug = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'scenario'
}

function screenshotFileName({ platform, scenarioName, kind, at = new Date() }) {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  return `${platform || 'device'}-${slugify(scenarioName)}-${kind}-${stamp}.png`
}

function toPosixRelative(fromDir, absPath) {
  return path.relative(fromDir, absPath).split(path.sep).join('/')
}

function isPng(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(8)
    fs.readSync(fd, buf, 0, 8, 0)
    fs.closeSync(fd)
    return buf.subarray(0, 4).equals(PNG_MAGIC)
  } catch {
    return false
  }
}

function resolveAdb() {
  if (process.env.ADB && fs.existsSync(process.env.ADB)) return process.env.ADB
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (sdk) {
    const candidate = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    if (fs.existsSync(candidate)) return candidate
  }
  return process.platform === 'win32' ? 'adb.exe' : 'adb'
}

function androidSerialArgs() {
  const serial = process.env.ANDROID_SERIAL || process.env.ANDROID_DEVICE_SERIAL
  return serial ? ['-s', serial] : []
}

function iosUdid() {
  return process.env.IOS_DEVICE_ID || process.env.IOS_SIM_ID || ''
}

function writePng(destPath, buffer) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, buffer)
  if (!isPng(destPath)) {
    try { fs.unlinkSync(destPath) } catch { /* ignore */ }
    throw new Error(`Screenshot at ${destPath} is not a PNG`)
  }
  return destPath
}

function captureAndroid(destPath) {
  const buffer = execFileSync(resolveAdb(), [...androidSerialArgs(), 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    maxBuffer: 25 * 1024 * 1024,
    timeout: 20000,
  })
  return writePng(destPath, buffer)
}

function captureIos(destPath) {
  const udid = iosUdid()
  if (!udid) throw new Error('IOS_DEVICE_ID / IOS_SIM_ID is not set')
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  execFileSync('xcrun', ['simctl', 'io', udid, 'screenshot', destPath], {
    stdio: 'pipe',
    timeout: 20000,
  })
  if (!isPng(destPath)) throw new Error(`iOS screenshot at ${destPath} is not a PNG`)
  return destPath
}

function captureDeviceScreenshot(platform, destPath) {
  if (platform === 'ios') return captureIos(destPath)
  return captureAndroid(destPath)
}

/**
 * Newest image under `root` modified at/after `sinceMs`.
 * `basename` limits the search (e.g. report-final.png).
 */
function findNewestImage(root, { sinceMs = 0, basename = null, skipDirNames = [] } = {} as any) {
  if (!root || !fs.existsSync(root)) return null
  let latest = null
  let latestMtime = sinceMs
  const stem = (name) => String(name).toLowerCase().replace(/\.(png|jpe?g)$/i, '')

  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (skipDirNames.includes(entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile() || !/\.(png|jpg|jpeg)$/i.test(entry.name)) continue
      if (basename && stem(entry.name) !== stem(basename)) continue
      let mtimeMs
      try {
        mtimeMs = fs.statSync(full).mtimeMs
      } catch {
        continue
      }
      if (mtimeMs >= latestMtime) {
        latestMtime = mtimeMs
        latest = full
      }
    }
  }

  walk(root)
  return latest
}

function copyScreenshot(src, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.copyFileSync(src, destPath)
  return destPath
}

/**
 * After a local Maestro scenario: keep one PNG for the HTML report **only on
 * failure**. Passed scenarios have no image. Capture the device immediately
 * (the error screen); Maestro's auto-fail shot is fallback.
 *
 * @returns {string|null} path relative to reportDir (posix), or null
 */
function collectScenarioScreenshot({
  platform,
  scenarioName,
  kind,
  reportDir,
  sinceMs,
  searchDir,
  captureFn = captureDeviceScreenshot,
  skipDeviceCapture = false,
}) {
  if (!reportDir || kind !== 'error') return null
  const destPath = path.join(
    reportDir,
    'screenshots',
    screenshotFileName({ platform, scenarioName, kind }),
  )

  const tryCopy = (src) => {
    if (!src || !fs.existsSync(src)) return null
    try {
      copyScreenshot(src, destPath)
      return toPosixRelative(reportDir, destPath)
    } catch (err) {
      console.warn(`Warning: could not copy screenshot ${src}: ${err.message}`)
      return null
    }
  }

  if (!skipDeviceCapture) {
    try {
      captureFn(platform, destPath)
      if (fs.existsSync(destPath)) return toPosixRelative(reportDir, destPath)
    } catch (err) {
      console.warn(`Warning: device screenshot failed (${kind}): ${err.message}`)
    }
  }

  const fallback = findNewestImage(searchDir, { sinceMs })
  const copied = tryCopy(fallback)
  if (copied) return copied

  return null
}

function isTakeScreenshotLine(line) {
  return /^-\s*takeScreenshot\b/.test(line) || /^takeScreenshot\s*:/.test(line)
}

function isCloseAppLine(line) {
  return (
    /^-\s*stopApp\b/.test(line) ||
    /^stopApp\s*:/.test(line) ||
    /^-\s*pressKey:\s*Home\b/i.test(line) ||
    /^pressKey:\s*Home\b/i.test(line) ||
    /^key:\s*Home\b/i.test(line)
  )
}

/**
 * True when the area YAML finishes by leaving the app (Home / stopApp),
 * optionally after `takeScreenshot: report-final`.
 */
function flowEndsByClosingApp(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false
  const raw = fs.readFileSync(filePath, 'utf8')
  const parts = raw.split(/\r?\n---\r?\n/)
  const body = parts.length > 1 ? parts.slice(1).join('\n---\n') : raw
  const commands = body
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  for (let i = commands.length - 1; i >= 0; i--) {
    const line = commands[i]
    if (isTakeScreenshotLine(line)) continue
    return isCloseAppLine(line)
  }
  return false
}

function screenshotLabel(kind, status) {
  if (kind === 'final') return 'Resultado final'
  if (kind === 'error') return 'En el error'
  return status === 'failed' ? 'En el error' : 'Resultado final'
}

export { MAESTRO_SHOT_BASENAME, slugify, screenshotFileName, screenshotLabel, toPosixRelative, isPng, findNewestImage, flowEndsByClosingApp, captureDeviceScreenshot, collectScenarioScreenshot }
