/**
 * verify-install.mjs — installing and starting must not do heavy media work.
 *
 * The three stalls this guards against were all real in 0.2.x, and none of them
 * is visible from "does the plugin work":
 *
 *   1. the first embedded request base64-decoded ALL FOUR clips at once;
 *   2. the listing sha256-hashed EVERY user file (a full read of each);
 *   3. the client prefetched the whole active video at mount.
 *
 * Each is now observable rather than a matter of opinion: `/status.json` reports
 * how many clips are decoded in memory, the registry reports when it hashes, and
 * the bundle is checked for a prefetch. That is what makes this suite worth
 * having — an install-time stall is exactly the regression no functional test
 * notices.
 *
 * Usage: node scripts/verify-install.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const report = createReport('install')

const MEDIA = '/dsh-boot-animation-pro/media/'

console.log('a brand-new environment:')
const h = await startHarness()
try {
  const list = await h.request('GET', '/dsh-boot-animation-pro/videos.json')
  report.check(list.status === 200, 'the library answers on a fresh install')
  const payload = list.json()
  report.check(payload.videos.length === 4, `the four built-ins are listed (${String(payload.videos.length)})`)
  report.check(payload.selectedClipId === null, 'nothing is selected yet')
  report.check(payload.fitMode === 'cover' && payload.randomPlayback === false, 'settings come up at their defaults')
  report.check(
    !existsSync(h.selectionFile()),
    'reading the library does NOT create a selection file (a read stays a read)',
  )

  const status0 = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
  report.check(
    status0.decodedClips === 0,
    `no embedded clip is decoded before media is requested (decodedClips=${String(status0.decodedClips)})`,
  )
  report.check(
    status0.count === 4,
    'and the listing is complete without decoding anything',
  )

  console.log('\nlazy, per clip:')
  await h.request('GET', `${MEDIA}${encodeURIComponent('builtin:brand')}`)
  const status1 = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
  report.check(
    status1.decodedClips === 1,
    `fetching ONE clip decodes exactly one (decodedClips=${String(status1.decodedClips)}) — not all four`,
  )

  await h.request('GET', `${MEDIA}${encodeURIComponent('builtin:cyberpunk')}`)
  const status2 = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
  report.check(status2.decodedClips === 2, `a second clip adds one more (decodedClips=${String(status2.decodedClips)})`)

  // The decoded cache is bounded, so cycling through many clips cannot grow without limit.
  for (const id of ['builtin:awakening', 'builtin:startup', 'builtin:brand', 'builtin:cyberpunk']) {
    await h.request('GET', `${MEDIA}${encodeURIComponent(id)}`)
  }
  const status3 = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
  report.check(status3.decodedClips <= 3, `the decoded cache stays bounded (decodedClips=${String(status3.decodedClips)})`)

  console.log('\nno hashing of a file that cannot collide:')
  {
    // 1,000,003 bytes is a size nothing else has, so proving this clip distinct
    // needs no read of it at all. The registry reports when it does hash.
    const path = h.put('big-unique.mp4', Buffer.alloc(1000003, 7))
    writeFileSync(path, Buffer.alloc(1000003, 7))
    const after = (await h.request('GET', '/dsh-boot-animation-pro/videos.json')).json()
    const entry = after.videos.find((clip) => clip.file === 'big-unique.mp4')
    report.check(entry !== undefined, 'a large dropped-in file is listed')

    const status = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
    const hashEvents = status.diagnostics.events.filter((event) => event.kind === 'content-hash-group')
    report.check(
      hashEvents.length === 0,
      `a file with a unique size is never hashed (${String(hashEvents.length)} hash groups)`,
    )
    report.check(
      typeof entry.version === 'string' && entry.version !== '',
      'and it still gets a content identity for cache pinning',
      String(entry.version),
    )
    report.check(typeof entry.mediaUrl === 'string' && entry.mediaUrl.includes('/media/'), 'and its own media URL')
  }

  console.log('\nhashing does happen where it is needed:')
  {
    // Two files with the SAME size can be equal, so they must be compared.
    h.put('twin-a.mp4', Buffer.alloc(2048, 1))
    h.put('twin-b.mp4', Buffer.alloc(2048, 1))
    await h.request('GET', '/dsh-boot-animation-pro/videos.json')
    const status = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
    const groups = status.diagnostics.events.filter((event) => event.kind === 'content-hash-group')
    report.check(groups.length > 0, 'a size collision triggers hashing')
    const listed = (await h.request('GET', '/dsh-boot-animation-pro/videos.json')).json().videos
    const twins = listed.filter((clip) => String(clip.file).startsWith('twin-'))
    report.check(twins.length === 1, `identical twins collapse to one row (${String(twins.length)} row)`)
    report.check(twins[0]?.copies === 2, 'and the row reports both copies')
  }
} finally {
  await h.close()
}

console.log('\nthe client does not prefetch media at startup:')
{
  const bundle = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
  report.check(!bundle.includes('force-cache'), 'no force-cache prefetch in the shipped bundle')
  report.check(!/boot\.mp4/.test(bundle), 'the client never asks for the shared legacy URL')
  report.check(bundle.includes('/media/'), 'it addresses clips through the per-clip media route')
}

report.finish()
