/**
 * verify-cache.mjs — one URL, one clip, one identity.
 *
 * This is the suite for the defect that made "select B, still see A until F5"
 * possible. The old design served every clip under `/boot.mp4`, and answered
 * `immutable` for a URL whose `?v=` matched *whatever was active* — so a URL that
 * said clip A could hand back clip B's bytes, or keep handing back A's from cache
 * after the switch. The invariants here are what make that impossible:
 *
 *   - each clip has its own ETag and its own resource;
 *   - `?v=` is honoured only when it matches the clip being served;
 *   - a validator from clip A never satisfies clip B;
 *   - failures are uncacheable, so a broken state cannot stick in the browser.
 *
 * Usage: node scripts/verify-cache.mjs
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const report = createReport('cache')
const h = await startHarness()

try {
  const list = (await h.request('GET', '/dsh-boot-animation-pro/videos.json')).json()
  const clips = list.videos.filter((clip) => clip.source === 'embedded')
  report.check(clips.length === 4, `the four built-in clips are listed (${String(clips.length)})`)

  const media = (id) => `/dsh-boot-animation-pro/media/${encodeURIComponent(id)}`

  console.log('identity:')
  const etags = new Map()
  for (const clip of clips) {
    const response = await h.request('GET', media(clip.id))
    etags.set(clip.id, response.headers.etag)
    report.check(response.status === 200, `${clip.id} serves 200`)
    report.check(response.body.length === clip.bytes, `${clip.id} serves exactly its declared bytes`)
    report.check(
      response.headers.etag === `"embedded-${String(clip.version)}"`,
      `${clip.id} carries its own content hash as ETag`,
    )
  }
  report.check(new Set(etags.values()).size === clips.length, 'all four built-in ETags are distinct')

  console.log('\ncache-control policy:')
  {
    const clip = clips[0]
    const bare = await h.request('GET', media(clip.id))
    report.check(bare.headers['cache-control'] === 'no-cache', 'a bare URL revalidates')

    const pinned = await h.request('GET', `${media(clip.id)}?v=${encodeURIComponent(String(clip.version))}`)
    report.check(pinned.headers['cache-control'] === 'public, max-age=31536000, immutable', 'a correctly pinned URL is immutable')

    // THE regression: another clip's version must never make this response
    // cacheable, because that is what froze a switched clip's old bytes.
    const foreign = clips.find((other) => other.id !== clip.id)
    const crossed = await h.request('GET', `${media(clip.id)}?v=${encodeURIComponent(String(foreign.version))}`)
    report.check(crossed.headers['cache-control'] === 'no-cache', "another clip's version does NOT make this response immutable")
    report.check(crossed.body.length === clip.bytes, 'and the bytes are still this clip’s own')

    const stale = await h.request('GET', `${media(clip.id)}?v=deadbeefdeadbeef`)
    report.check(stale.headers['cache-control'] === 'no-cache', 'an unknown version revalidates')
  }

  console.log('\nconditional requests:')
  {
    const a = clips[0]
    const b = clips[1]
    const first = await h.request('GET', media(a.id))
    const same = await h.request('GET', media(a.id), { headers: { 'if-none-match': String(first.headers.etag) } })
    report.check(same.status === 304, 'the same clip with its own ETag answers 304')
    report.check(same.body.length === 0, '304 carries no body')
    report.check(same.headers['cache-control'] === 'no-cache', '304 keeps the cache policy')

    const wrong = await h.request('GET', media(b.id), { headers: { 'if-none-match': String(first.headers.etag) } })
    report.check(wrong.status === 200, "a validator from clip A does NOT satisfy clip B")
    report.check(wrong.body.length === b.bytes, 'and clip B gets its own bytes')

    const star = await h.request('GET', media(a.id), { headers: { 'if-none-match': '*' } })
    report.check(star.status === 304, 'If-None-Match: * is honoured')
  }

  console.log('\nrange requests:')
  {
    const clip = clips[0]
    const head = await h.request('GET', media(clip.id), { headers: { range: 'bytes=0-99' } })
    report.check(head.status === 206, 'a byte range answers 206')
    report.check(head.body.length === 100, 'and returns exactly the requested length')
    report.check(
      head.headers['content-range'] === `bytes 0-99/${String(clip.bytes)}`,
      'with a correct content-range',
      String(head.headers['content-range']),
    )
    report.check(head.headers['accept-ranges'] === 'bytes', 'and advertises accept-ranges')

    const tail = await h.request('GET', media(clip.id), { headers: { range: 'bytes=-50' } })
    report.check(tail.status === 206 && tail.body.length === 50, 'a suffix range returns the last N bytes')

    const open = await h.request('GET', media(clip.id), { headers: { range: 'bytes=100-' } })
    report.check(open.status === 206 && open.body.length === clip.bytes - 100, 'an open-ended range runs to the end')

    const bad = await h.request('GET', media(clip.id), { headers: { range: 'bytes=99999999-' } })
    report.check(bad.status === 416, 'an unsatisfiable range answers 416')
    report.check(bad.headers['cache-control'] === 'no-store', 'and 416 is uncacheable')
  }

  console.log('\nuncacheable failures:')
  {
    const missing = await h.request('GET', media('builtin:does-not-exist'))
    report.check(missing.status === 404, 'an unknown clip id is 404')
    report.check(missing.headers['cache-control'] === 'no-store', 'and 404 is uncacheable')
    const noRoute = await h.request('GET', '/dsh-boot-animation-pro/media')
    report.check(noRoute.status === 404, 'the bare media prefix is 404')
  }

  console.log('\na file clip whose bytes change:')
  {
    const path = h.put('changing.mp4', Buffer.from('first-version-bytes'))
    const before = await h.request('GET', '/dsh-boot-animation-pro/videos.json')
    const entry = before.json().videos.find((clip) => clip.file === 'changing.mp4')
    report.check(entry !== undefined, 'the dropped-in file is listed')

    const first = await h.request('GET', media(entry.id))
    report.check(first.status === 200 && first.body.toString() === 'first-version-bytes', 'it serves its bytes')
    const etagBefore = first.headers.etag

    // Same path, new bytes: the validator must change, or a browser would keep
    // serving the old content from its cache entry.
    const { writeFileSync } = await import('node:fs')
    writeFileSync(path, 'second-version-bytes')
    const second = await h.request('GET', media(entry.id), { headers: { 'if-none-match': String(etagBefore) } })
    report.check(second.status === 200, 'a changed file fails the old validator')
    report.check(second.body.toString() === 'second-version-bytes', 'and the new bytes are served')
    report.check(second.headers.etag !== etagBefore, 'the ETag changes with the bytes')
  }
} finally {
  await h.close()
}

report.finish()
