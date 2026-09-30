/**
 * make-intro-video.mjs — render the intro overlay to a video file.
 *
 * What this produces is the plugin's REAL overlay — its own stylesheet, its own
 * markup, its own embedded clip, its own progress bar and skip button — rendered
 * by a real Chromium and captured frame by frame. It is not a screen recording of
 * a desktop: there is no wallpaper, no other window, no session list, and the
 * frame timing is exact instead of whatever the compositor managed that second.
 *
 * How it works, and why in this order:
 *
 *   1. The clip is served from `lib/clips.data.js`, the same bytes the plugin
 *      serves at runtime. The recording therefore shows what a user sees.
 *   2. The stylesheet comes from `lib/client.js` (its `CSS` export). A copy of the
 *      sheet in this file would keep "passing" after the class names moved — that
 *      is not hypothetical, it is what the letterbox probe used to do.
 *   3. Frames are produced by SEEKING a paused element, not by playing it. A
 *      playing element gives you frames at the mercy of the decoder and the
 *      screenshot round trip; seeking gives exactly `fps` evenly spaced frames,
 *      so the encoder receives a constant-rate sequence.
 *   4. The progress bar is advanced with the seek, because that is what the real
 *      component does on `timeupdate`. Encoding a frozen bar would ship a bug in
 *      the demo that the plugin does not have.
 *
 * Usage:
 *   node scripts/make-intro-video.mjs --out intro.mp4
 *   node scripts/make-intro-video.mjs --clip builtin:cyberpunk --width 1920 --height 1080
 *   node scripts/make-intro-video.mjs --title "DeepSeek Harness" --watermark "@you"
 *
 * Requires a Chromium-family browser and `ffmpeg` (see `--ffmpeg`).
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadClientBundle } from './lib/client-bundle.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}
const flag = (name) => process.argv.includes(name)

const CLIP_ID = arg('--clip', 'builtin:brand')
const WIDTH = Number(arg('--width', '1920'))
const HEIGHT = Number(arg('--height', '1080'))
const FPS = Number(arg('--fps', '30'))
const TITLE = arg('--title', '')
const SUBTITLE = arg('--subtitle', '')
const WATERMARK = arg('--watermark', '')
/** Seconds to skip from the head and tail: idents often open on black. */
const TRIM_START = Number(arg('--trim-start', '0'))
const TRIM_END = Number(arg('--trim-end', '0'))
const DURATION_LIMIT = Number(arg('--duration', '0'))
const OUT = arg('--out', join(ROOT, 'intro.mp4'))
const SHOTS_DIR = arg('--shots', '')
const DEBUG_PORT = 9500 + (process.pid % 400)

const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

/** Find ffmpeg: explicit flag, then PATH, then the `imageio-ffmpeg` wheel. */
function findFfmpeg() {
  const explicit = arg('--ffmpeg', process.env.FFMPEG ?? '')
  if (explicit !== '') return explicit
  const onPath = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  if (onPath.status === 0) return 'ffmpeg'
  for (const python of ['python3', 'python']) {
    const probe = spawnSync(python, ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], {
      encoding: 'utf8',
    })
    if (probe.status === 0 && probe.stdout.trim() !== '') return probe.stdout.trim()
  }
  console.error('make-intro-video: no ffmpeg found. Install it, or pass --ffmpeg <path>.')
  process.exit(2)
}

const browser = BROWSERS.find((p) => existsSync(p))
if (browser === undefined) {
  console.error('make-intro-video: no Chromium-family browser found.')
  process.exit(2)
}
const ffmpeg = findFfmpeg()

// ------------------------------------------------------------------ the clip

const meta = await import(pathToFileURL(join(ROOT, 'lib', 'clips.meta.js')).href)
const data = await import(pathToFileURL(join(ROOT, 'lib', 'clips.data.js')).href)
const shortName = CLIP_ID.startsWith('builtin:') ? CLIP_ID.slice('builtin:'.length) : CLIP_ID
const clipMeta = meta.CLIPS.find((entry) => entry.id === shortName)
if (clipMeta === undefined || typeof data[shortName] !== 'string') {
  console.error(`make-intro-video: ${CLIP_ID} is not an embedded clip. Available: ${meta.CLIPS.map((c) => 'builtin:' + c.id).join(', ')}`)
  process.exit(2)
}
const clipBytes = Buffer.from(data[shortName], 'base64')
console.log(`clip      : ${CLIP_ID} — ${clipMeta.name} (${String(clipBytes.length)} bytes)`)

// ------------------------------------------------------------------ the page

const bundle = loadClientBundle()
if (typeof bundle.CSS !== 'string') {
  console.error('make-intro-video: the bundle does not export its stylesheet.')
  process.exit(2)
}

/**
 * The overlay, built to match `BootOverlay`'s output exactly.
 *
 * Kept in step with `src/client/ui-overlay.ts` by hand — the alternative is
 * rendering the React component, which needs the DSH slot services this script
 * deliberately does not stand up. The classes are the contract, and
 * `verify-i18n`/`verify-letterbox` already fail if the stylesheet and the
 * components disagree about them.
 */
const page = `<!doctype html><meta charset="utf-8"><title>intro recorder</title>
<style>html,body{margin:0;padding:0;overflow:hidden;background:#000}
${bundle.CSS}
</style>
<div class="dbap-root" id="root">
  <video class="dbap-video dbap-cover" id="v" src="/clip.mp4" muted playsinline preload="auto"></video>
  <div class="dbap-what" id="what"></div>
  ${TITLE === '' && SUBTITLE === '' ? '' : `<div class="dbap-caption">
    ${TITLE === '' ? '' : `<div class="dbap-caption-title">${TITLE}</div>`}
    ${SUBTITLE === '' ? '' : `<div class="dbap-caption-sub">${SUBTITLE}</div>`}
  </div>`}
  ${WATERMARK === '' ? '' : `<div class="dbap-watermark">${WATERMARK}</div>`}
  <div class="dbap-progress"><i id="bar"></i></div>
  <button class="dbap-skip" id="skip">跳过</button>
  <div class="dbap-hint">点击开启声音 · 全屏</div>
</div>
<script>
const v = document.getElementById('v');
const bar = document.getElementById('bar');
document.getElementById('what').textContent = ${JSON.stringify('已选片头 · ' + clipMeta.name)};

window.__ready = new Promise((resolve) => {
  const done = () => resolve({ duration: v.duration, w: v.videoWidth, h: v.videoHeight, error: v.error ? v.error.code : null });
  if (v.readyState >= 1 && Number.isFinite(v.duration)) done();
  else { v.addEventListener('loadedmetadata', done, { once: true }); v.addEventListener('error', done, { once: true }); }
});

/** Land on one exact time, wait for the frame to be painted, move the bar. */
window.__seek = async (t) => {
  if (Math.abs(v.currentTime - t) > 1e-4) {
    await new Promise((resolve) => {
      v.addEventListener('seeked', resolve, { once: true });
      v.currentTime = t;
    });
  }
  // Two frames: one for the decoder to hand over the picture, one for the
  // compositor to put it on screen. One is not always enough after a seek.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  bar.style.width = (t / v.duration) * 100 + '%';
  return v.currentTime;
};
</script>`

// ----------------------------------------------------------- static server

const scratch = mkdtempSync(join(tmpdir(), 'dba-record-'))
const framesDir = join(scratch, 'frames')
mkdirSync(framesDir, { recursive: true })

const server = createServer((req, res) => {
  const path = String(req.url ?? '').split('?')[0]
  if (path === '/clip.mp4') {
    res.writeHead(200, {
      'content-type': 'video/mp4',
      'content-length': String(clipBytes.length),
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    })
    res.end(clipBytes)
    return
  }
  if (path === '/' || path === '/probe.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page)
    return
  }
  res.writeHead(404, { 'cache-control': 'no-store' })
  res.end('no')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const pageUrl = `http://127.0.0.1:${String(port)}/probe.html`

// ------------------------------------------------------------------ capture

const child = spawn(
  browser,
  [
    '--headless=new',
    `--remote-debugging-port=${String(DEBUG_PORT)}`,
    `--user-data-dir=${join(scratch, 'profile')}`,
    `--window-size=${String(WIDTH)},${String(HEIGHT)}`,
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
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
    }, 60000)
  })
const evaluate = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r?.exceptionDetails !== undefined) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r?.result?.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const deadline = Date.now() + 30000
  let wsUrl = null
  while (Date.now() < deadline && wsUrl === null) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${String(DEBUG_PORT)}/json/list`)).json()
      const target = list.find((t) => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string')
      if (target !== undefined) wsUrl = target.webSocketDebuggerUrl
    } catch {
      /* still starting */
    }
    if (wsUrl === null) await sleep(300)
  }
  if (wsUrl === null) throw new Error('no debug target appeared')

  socket = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = (e) => reject(new Error('ws error ' + String(e?.message ?? e)))
  })
  socket.onmessage = (event) => {
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

  await call('Page.enable')
  await call('Runtime.enable')
  // Pin the viewport: the screenshot must be exactly WIDTH x HEIGHT, not whatever
  // the window chrome left over.
  await call('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await call('Page.navigate', { url: pageUrl })

  const info = await evaluate('window.__ready.then(i => JSON.stringify(i))').then((raw) => JSON.parse(raw))
  if (!(info.duration > 0)) throw new Error(`the clip did not load: ${JSON.stringify(info)}`)
  console.log(`source    : ${String(info.w)}x${String(info.h)} @ ${info.duration.toFixed(2)}s`)

  const start = Math.max(0, TRIM_START)
  const end = Math.min(info.duration, info.duration - Math.max(0, TRIM_END))
  const span = DURATION_LIMIT > 0 ? Math.min(DURATION_LIMIT, end - start) : end - start
  const frameCount = Math.max(1, Math.round(span * FPS))
  console.log(`render    : ${String(WIDTH)}x${String(HEIGHT)} @ ${String(FPS)}fps, ${String(frameCount)} frames (${span.toFixed(2)}s)`)

  const started = Date.now()
  for (let i = 0; i < frameCount; i += 1) {
    const t = Math.min(start + i / FPS, end - 1e-3)
    await evaluate(`window.__seek(${String(t)})`)
    const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(framesDir, `f${String(i).padStart(5, '0')}.png`), Buffer.from(shot.data, 'base64'))
    if (i % 30 === 0 || i === frameCount - 1) {
      const pct = Math.round(((i + 1) / frameCount) * 100)
      process.stdout.write(`\r  capturing ${String(pct)}%  (frame ${String(i + 1)}/${String(frameCount)})`)
    }
  }
  process.stdout.write('\n')
  console.log(`captured  : ${String(readdirSync(framesDir).length)} frames in ${String(Math.round((Date.now() - started) / 1000))}s`)

  if (SHOTS_DIR !== '') {
    // Copied from the captured sequence, not re-captured: the element is parked on
    // the last frame by now, so a second screenshot would only ever give that one.
    mkdirSync(SHOTS_DIR, { recursive: true })
    const names = readdirSync(framesDir).sort()
    for (const pick of [0, Math.floor(names.length / 2), names.length - 1]) {
      copyFileSync(join(framesDir, names[pick]), join(SHOTS_DIR, `still-${String(pick)}.png`))
    }
    console.log(`stills    : ${SHOTS_DIR}`)
  }
} finally {
  try {
    socket?.close()
  } catch {
    /* already closed */
  }
  child.kill()
  server.close()
}

// ------------------------------------------------------------------ encode

console.log('encoding  : H.264 / yuv420p / faststart')
const encode = spawnSync(
  ffmpeg,
  [
    '-y', '-v', 'error',
    '-framerate', String(FPS),
    '-i', join(framesDir, 'f%05d.png'),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    // Douyin, QuickTime and every phone want 4:2:0 and even dimensions.
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    OUT,
  ],
  { encoding: 'utf8' },
)
if (encode.status !== 0) {
  console.error('ffmpeg failed:\n' + String(encode.stderr ?? '').slice(0, 800))
  process.exit(1)
}
const probe = spawnSync(ffmpeg, ['-v', 'error', '-i', OUT, '-f', 'null', '-'], { encoding: 'utf8' })
console.log(`output    : ${OUT}`)
console.log(`verify    : ${probe.status === 0 ? 'ffmpeg read it back cleanly' : 'COULD NOT BE READ BACK'}`)

rmSync(scratch, { recursive: true, force: true })
