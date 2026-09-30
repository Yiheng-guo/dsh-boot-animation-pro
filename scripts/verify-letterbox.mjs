/**
 * verify-letterbox.mjs — measure, in a real browser, how much black the overlay
 * leaves around the clip.
 *
 * Why this exists: "there is a black bar" is a claim about RENDERED layout, and
 * reasoning about `object-fit` in the abstract got it wrong once already. This
 * drives a real Chromium over CDP, puts the plugin's OWN stylesheet and a real
 * built-in clip in front of a real layout engine, and reads the numbers back: the
 * video element's box, the viewport it sits in, and the letterbox the chosen
 * `object-fit` actually produces.
 *
 * Two corrections over the version this came from, both of which it needed:
 *
 *   - It injects `CSS` from the SHIPPED BUNDLE. The old probe carried its own copy
 *     of the overlay rules, so it kept passing after the class names it copied had
 *     been renamed away — a test of a copy is not a test of the product.
 *   - It serves the clip itself, so it needs no running DSH. The old probe
 *     hardcoded `127.0.0.1:3080` and only looked for Edge on Windows.
 *
 * `--port` still points it at a live DSH when one is running; by default it starts
 * a throwaway server that answers the plugin's own media route.
 *
 * Usage: node scripts/verify-letterbox.mjs [--port 3080] [--width 2560] [--height 1400] [--shot <dir>]
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadClientBundle } from './lib/client-bundle.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const num = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : Number(process.argv[i + 1])
}
const str = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}

const PORT = num('--port', 0)
const WIDTH = num('--width', 2560)
const HEIGHT = num('--height', 1400)
const SHOT_DIR = str('--shot')
const DEBUG_PORT = 9400 + (process.pid % 150)

/** Chromium builds, in the order they are likely to exist on each platform. */
const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]
const browser = BROWSERS.find((p) => existsSync(p))
if (browser === undefined) {
  console.error('verify-letterbox: no Chromium-family browser found in the usual locations')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bundle = loadClientBundle()
if (typeof bundle.CSS !== 'string' || bundle.CSS.length === 0) {
  console.error('verify-letterbox: the bundle does not export its stylesheet — cannot measure the real thing')
  process.exit(2)
}

/** The bytes of the first built-in clip, so the probe has something to decode. */
async function builtinClip() {
  const meta = await import(pathToFileURL(join(ROOT, 'lib', 'clips.meta.js')).href)
  const data = await import(pathToFileURL(join(ROOT, 'lib', 'clips.data.js')).href)
  const first = meta.CLIPS[0]
  const bytes = Buffer.from(data[first.id], 'base64')
  return { name: first.name, id: first.id, bytes }
}

/**
 * The probe page: the plugin's OWN markup, with the sheet injected at runtime so
 * the class names cannot drift away from the ones being measured.
 *
 * The magenta background is not decoration. It is what makes a letterbox bar
 * visible in a screenshot: a black bar on a black page is indistinguishable from
 * a clip that never painted.
 */
function probePage(videoUrl) {
  return `<!doctype html><meta charset="utf-8"><title>letterbox probe</title>
<style>html,body{margin:0;padding:0;overflow:hidden;background:#f0f}</style>
<div class="dbap-root"><video class="dbap-video" id="v" src="${videoUrl}"
  muted autoplay playsinline preload="auto"></video></div>`
}

let server = null
let videoUrl = `${'http://127.0.0.1:' + String(PORT)}/dsh-boot-animation-pro/boot.mp4`
let pageUrl = null
let clipLabel = 'a live DSH'

const dir = mkdtempSync(join(tmpdir(), 'dba-probe-'))

if (PORT === 0) {
  const clip = await builtinClip()
  clipLabel = `${clip.name} (${String(clip.bytes.length)} bytes, embedded)`
  server = createServer((req, res) => {
    const path = String(req.url ?? '').split('?')[0]
    if (path === '/dsh-boot-animation-pro/boot.mp4') {
      res.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(clip.bytes.length),
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      })
      res.end(clip.bytes)
      return
    }
    if (path === '/probe.html') {
      const body = probePage(`/dsh-boot-animation-pro/boot.mp4`)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': String(Buffer.byteLength(body)) })
      res.end(body)
      return
    }
    res.writeHead(404, { 'cache-control': 'no-store' })
    res.end('no')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const actualPort = typeof address === 'object' && address !== null ? address.port : 0
  videoUrl = `http://127.0.0.1:${String(actualPort)}/dsh-boot-animation-pro/boot.mp4`
  pageUrl = `http://127.0.0.1:${String(actualPort)}/probe.html`
} else {
  pageUrl = `file:///${join(dir, 'probe.html').replace(/\\/g, '/')}`
  writeFileSync(join(dir, 'probe.html'), probePage(videoUrl), 'utf8')
}

const child = spawn(
  browser,
  [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${join(dir, 'profile')}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let socket
const handlers = new Map()
let nextId = 0

const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = (nextId += 1)
    handlers.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (handlers.has(id)) {
        handlers.delete(id)
        reject(new Error(`timeout: ${method}`))
      }
    }, 20000)
  })

async function findTarget() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${String(DEBUG_PORT)}/json/list`)).json()
      const target = list.find((t) => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string')
      if (target !== undefined) return target.webSocketDebuggerUrl
    } catch {
      /* still starting */
    }
    await sleep(400)
  }
  throw new Error('no debug target appeared')
}

async function openSocket(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = (e) => reject(new Error('ws error ' + String(e?.message ?? e)))
  })
  ws.onmessage = (event) => {
    let m
    try {
      m = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (m.id === undefined) return
    const h = handlers.get(m.id)
    if (h === undefined) return
    handlers.delete(m.id)
    if (m.error !== undefined) h.reject(new Error(JSON.stringify(m.error)))
    else h.resolve(m.result)
  }
  return ws
}

async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r?.exceptionDetails !== undefined) {
    throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 240))
  }
  return r?.result?.value
}

/**
 * Walk the real sheet into the page, then report whether the probes can see it.
 *
 * Returns a JSON STRING rather than an object: `Runtime.evaluate` only fills
 * `result.value` with `returnByValue: true`, and a string round-trips through
 * every CDP version without relying on that. The measurement below does the same.
 */
async function injectStylesheet() {
  const raw = await evaluate(`(() => {
    const existing = document.getElementById(${JSON.stringify(bundle.STYLE_ID)});
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = ${JSON.stringify(bundle.STYLE_ID)};
    style.textContent = ${JSON.stringify(bundle.CSS)};
    document.head.appendChild(style);
    const root = document.querySelector('.dbap-root');
    const video = document.getElementById('v');
    return JSON.stringify({
      hasRoot: root !== null,
      hasVideo: video !== null,
      rootBackground: root === null ? null : getComputedStyle(root).backgroundColor,
      rootPosition: root === null ? null : getComputedStyle(root).position,
      videoObjectFit: video === null ? null : getComputedStyle(video).objectFit,
      videoBox: video === null ? null : [Math.round(video.getBoundingClientRect().width), Math.round(video.getBoundingClientRect().height)],
    });
  })()`)
  if (typeof raw !== 'string') throw new Error(`the stylesheet probe returned ${typeof raw}; the page is probably not the probe page`)
  return JSON.parse(raw)
}

const MEASURE = (mode) => `(() => {
  const v = document.getElementById('v');
  v.pause();
  v.className = 'dbap-video' + (${JSON.stringify(mode)} === 'cover' ? ' dbap-cover' : '');
  const r = v.getBoundingClientRect();
  const vw = v.videoWidth, vh = v.videoHeight;
  const fit = getComputedStyle(v).objectFit;
  const scale = fit === 'cover'
    ? Math.max(r.width / vw, r.height / vh)
    : Math.min(r.width / vw, r.height / vh);
  const drawnW = vw * scale, drawnH = vh * scale;
  // Black bars exist only when the drawn image is SMALLER than the element.
  // When it is larger (cover), the excess is cropped instead — that is padding,
  // not letterboxing, and reporting it as a bar is how a correct result got
  // read as a failure once.
  const barX = Math.max(0, Math.round((r.width - drawnW) / 2));
  const barY = Math.max(0, Math.round((r.height - drawnH) / 2));
  const cropX = Math.max(0, Math.round((drawnW - r.width) / 2));
  const cropY = Math.max(0, Math.round((drawnH - r.height) / 2));
  return JSON.stringify({
    mode: ${JSON.stringify(mode)},
    objectFit: fit,
    viewport: [window.innerWidth, window.innerHeight],
    elementBox: [Math.round(r.width), Math.round(r.height)],
    drawnImage: [Math.round(drawnW), Math.round(drawnH)],
    barX, barY, cropX, cropY,
    clip: [vw, vh],
    readyState: v.readyState,
    error: v.error ? v.error.code : null,
  });
})()`

/** One PNG of the current frame, when a destination directory was asked for. */
async function screenshot(name) {
  if (SHOT_DIR === null) return
  const r = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SHOT_DIR, name), Buffer.from(r.data, 'base64'))
}

try {
  socket = await openSocket(await findTarget())
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Page.navigate', { url: pageUrl })

  await sleep(600)
  const applied = await injectStylesheet()
  console.log(`stylesheet: id=${bundle.STYLE_ID} ${String(bundle.CSS.length)} chars`)
  console.log(`probe clip: ${clipLabel}`)
  console.log(`root computed: position=${applied.rootPosition} background=${applied.rootBackground}`)

  const deadline = Date.now() + 30000
  let ready = false
  while (Date.now() < deadline) {
    const s = JSON.parse(await evaluate(MEASURE('cover')))
    if (s.readyState >= 2 && s.clip[0] > 0) {
      console.log(`clip loaded: readyState=${String(s.readyState)} clip=${s.clip.join('x')} video error=${String(s.error)}`)
      ready = true
      break
    }
    await sleep(400)
  }
  if (!ready) console.log('WARNING: clip never reached readyState>=2 — measuring layout anyway')

  const cover = JSON.parse(await evaluate(MEASURE('cover')))
  const contain = JSON.parse(await evaluate(MEASURE('contain')))

  const fmt = (m) =>
    `  ${m.mode.padEnd(8)} object-fit=${m.objectFit.padEnd(8)} viewport=${m.viewport.join('x')} ` +
    `clip=${m.clip.join('x')} element=${m.elementBox.join('x')} drawn=${m.drawnImage.join('x')} ` +
    `→ black bar ${String(m.barX)}px L/R, ${String(m.barY)}px T/B` +
    (m.cropX > 0 || m.cropY > 0 ? ` (crops ${String(m.cropX)}px L/R, ${String(m.cropY)}px T/B)` : '')

  console.log('\nmeasured in the browser layout engine:')
  console.log(fmt(cover))
  console.log(fmt(contain))

  await evaluate(MEASURE('cover'))
  await screenshot('letterbox-cover.png')
  await evaluate(MEASURE('contain'))
  await screenshot('letterbox-contain.png')
  if (SHOT_DIR !== null) console.log(`\nscreenshots written to ${SHOT_DIR}`)

  const failures = []
  if (cover.objectFit !== 'cover') failures.push(`fill mode resolved to object-fit:${cover.objectFit}`)
  if (cover.barX !== 0 || cover.barY !== 0) {
    failures.push(`fill mode still leaves ${String(cover.barX)}px L/R and ${String(cover.barY)}px T/B of black`)
  }
  if (cover.elementBox[0] !== cover.viewport[0] || cover.elementBox[1] !== cover.viewport[1]) {
    failures.push(`video element ${cover.elementBox.join('x')} does not fill viewport ${cover.viewport.join('x')}`)
  }
  if (contain.barX === 0 && contain.barY === 0) {
    failures.push('NOTE: at this viewport the two fit modes render identically — choose a size where they differ')
  }

  console.log('')
  if (failures.length === 0) {
    console.log('PASS: fill mode covers the whole viewport with no black bars')
    console.log(`      (whole-frame mode would leave ${String(contain.barX)}px L/R, ${String(contain.barY)}px T/B at this size)`)
  } else {
    console.log('FAIL:')
    for (const f of failures) console.log('  - ' + f)
    process.exitCode = 1
  }
} catch (error) {
  console.error('verify-letterbox failed:', String(error?.message ?? error))
  process.exitCode = 2
} finally {
  try {
    socket?.close()
  } catch {
    /* already closed */
  }
  child.kill()
  server?.close()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* leave the temp dir if it is locked */
  }
}
