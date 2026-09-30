/**
 * verify-fallback.mjs — a broken clip degrades, it does not take anything down.
 *
 * The error boundaries are only real if they are exercised, so this suite breaks
 * things on purpose:
 *
 *   - a selection pointing at a clip that no longer exists
 *   - a zero-byte file, a non-video file, a directory that looks like a clip dir
 *   - an environment variable pointing at nonsense
 *   - embedded bytes that cannot be loaded at all
 *
 * The assertions are always the same two: the response is a clean, UNCACHEABLE
 * error rather than a hang or a crash, and the plugin still answers the next
 * request. The boundary that owns the failure is also asserted, because "media
 * failed" and "the plugin failed" must not be confusable in diagnostics.
 *
 * Usage: node scripts/verify-fallback.mjs
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const report = createReport('fallback')

const { MediaServer } = await import(pathToFileURL(join(ROOT, 'lib', 'host', 'media-server.js')).href)

console.log('a selection that points at nothing:')
{
  const h = await startHarness()
  try {
    const clips = (await h.request('GET', '/dsh-boot-animation-pro/videos.json')).json().videos
    const target = clips[1]
    await h.request('POST', '/dsh-boot-animation-pro/select', { body: { selectedClipId: target.id } })

    // Patch the stored id to something that does not exist, exactly as a deleted
    // file would leave it.
    h.writeSelection({ version: 2, selectedClipId: 'builtin:deleted-long-ago', randomPlayback: false, fitMode: 'cover' })
    const resolved = await h.request('GET', '/dsh-boot-animation-pro/resolve.json')
    const body = resolved.json()
    report.check(resolved.status === 200, 'resolve still answers 200')
    report.check(body.clipId !== null, 'and falls through to a clip that does exist')
    report.check(body.how !== 'selected', `the reason says it was not the selection (${String(body.how)})`)
    const status = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
    report.check(
      status.diagnostics.events.some((event) => event.kind === 'selection-stale'),
      'the stale selection is reported through diagnostics',
    )
  } finally {
    await h.close()
  }
}

console.log('\nunusable files in the library directory:')
{
  const h = await startHarness()
  try {
    h.put('empty.mp4', Buffer.alloc(0))
    h.put('notes.txt', Buffer.from('not a video'))
    const dir = join(h.home, 'boot-animation-pro', 'videos')
    mkdirSync(join(dir, 'a-folder.mp4'), { recursive: true })

    const list = await h.request('GET', '/dsh-boot-animation-pro/videos.json')
    report.check(list.status === 200, 'the listing survives unusable entries')
    const names = list.json().videos.map((clip) => clip.file)
    report.check(!names.includes('empty.mp4'), 'a zero-byte file is not listed')
    report.check(!names.includes('notes.txt'), 'a non-video extension is not listed')
    report.check(!names.includes('a-folder.mp4'), 'a directory named like a video is not listed')
  } finally {
    await h.close()
  }
}

console.log('\nenvironment variable nonsense:')
{
  const h = await startHarness({ env: { DSH_BOOT_ANIMATION: 'C:/definitely/not/here.mp4' } })
  try {
    const resolved = (await h.request('GET', '/dsh-boot-animation-pro/resolve.json')).json()
    report.check(resolved.clipId !== null, 'a bad DSH_BOOT_ANIMATION falls through to a real clip')
    report.check(resolved.how !== 'env', 'and is not reported as the env clip')
    const status = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
    report.check(
      status.diagnostics.events.some((event) => event.kind === 'env-clip-error'),
      'the unusable env path is reported',
    )
  } finally {
    await h.close()
  }
}

console.log('\na real file via the environment variable (backward compatibility):')
{
  // Deliberately OUTSIDE the managed directories: the point of
  // DSH_BOOT_ANIMATION is that it can point anywhere, which is the case the
  // registry has to `adopt` rather than discover by scanning.
  const scratch = mkdtempSync(join(tmpdir(), 'dba-env-'))
  const envPath = join(scratch, 'env-clip.mp4')
  writeFileSync(envPath, Buffer.from('pretend-mp4-bytes-env'))
  const h = await startHarness({ env: { DSH_BOOT_ANIMATION: envPath } })
  try {
    const resolved = (await h.request('GET', '/dsh-boot-animation-pro/resolve.json')).json()
    report.check(resolved.how === 'env', `DSH_BOOT_ANIMATION is honoured (how=${String(resolved.how)})`)
    const bytes = await h.request('GET', resolved.mediaUrl)
    report.check(bytes.body.toString() === 'pretend-mp4-bytes-env', 'and its own bytes are served')
    report.check(
      String(resolved.mediaUrl).includes('/media/'),
      'the env clip is addressed by its own ClipId, not a shared URL',
    )
  } finally {
    await h.close()
    rmSync(scratch, { recursive: true, force: true })
  }
}

console.log('\nembedded bytes that cannot be loaded:')
{
  const diagnostics = { events: [], event(kind, detail) { this.events.push({ kind, detail }) } }
  const broken = new MediaServer({ dataModulePath: '../no-such-data-module.js', diagnostics })
  let status = 0
  let headers = {}
  let body = ''
  const res = {
    writeHead(code, given = {}) {
      status = code
      headers = given
    },
    end(chunk) {
      if (chunk !== undefined) body += String(chunk)
    },
  }
  const clip = { id: 'builtin:ghost', kind: 'embedded', embedded: 'ghost', bytes: 10, contentKey: 'x' }
  await broken.serve({ method: 'GET', url: '/dsh-boot-animation-pro/media/builtin:ghost', headers: {} }, res, clip)
  report.check(status === 500, `an unloadable embedded clip answers 500 (got ${String(status)})`)
  report.check(headers['cache-control'] === 'no-store', 'and the failure is uncacheable')
  const failed = diagnostics.events.find((event) => event.kind === 'media-error')
  report.check(failed !== undefined, 'the failure is recorded as a media event')
  report.check(failed?.detail?.boundary === 'media', 'and is tagged with the MEDIA boundary, not the plugin one')
}

console.log('\nthe plugin is still alive after all of that:')
{
  const h = await startHarness()
  try {
    // Provoke every failure path in one session, then check the plugin still serves.
    await h.request('GET', '/dsh-boot-animation-pro/media/does-not-exist')
    await h.request('POST', '/dsh-boot-animation-pro/select', { body: { selectedClipId: 'nope' } })
    h.writeSelection('{ broken')
    await h.request('GET', '/dsh-boot-animation-pro/videos.json')
    const after = await h.request('GET', '/dsh-boot-animation-pro/videos.json')
    report.check(after.status === 200, 'the library still answers 200')
    report.check(after.json().videos.length >= 4, 'and still lists the built-ins')
    const resolved = await h.request('GET', '/dsh-boot-animation-pro/resolve.json')
    report.check(resolved.status === 200 && resolved.json().clipId !== null, 'and still resolves a playable clip')
  } finally {
    await h.close()
  }
}

report.finish()
