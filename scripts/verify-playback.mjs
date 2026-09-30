/**
 * verify-playback.mjs — the client's URL and the host's bytes are the same clip.
 *
 * This is the end-to-end claim the whole refactor exists for:
 *
 *   select A -> A plays, select B -> B plays, C -> C, D -> D,
 *   with no page reload, and previewing each one plays that one.
 *
 * It is tested by running BOTH halves for real: the shipped browser bundle builds
 * the URL, and the built host serves it through its real route handlers (the
 * harness routes `fetch` straight into them). Nothing is simulated except the
 * <video> element, which is not what was broken — the URL was.
 *
 * Usage: node scripts/verify-playback.mjs
 */
import { builtinClips, loadClientBundle } from './lib/client-bundle.mjs'
import { createReport, startHarness } from './lib/harness.mjs'

const report = createReport('playback')
const bundle = loadClientBundle()
const h = await startHarness()

/** Route the bundle's fetch calls into the real host handlers. */
function bridgeFetch() {
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body))
    const response = await h.request(method, String(url), { body })
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.json(),
    }
  }
}

try {
  bridgeFetch()
  const store = new bundle.ClientStore()
  await store.loadCatalog()
  const catalog = store.getSnapshot().catalog
  report.check(catalog !== null && catalog.clips.length === 4, `the client loaded the real catalog (${String(catalog?.clips.length)})`)

  const clips = catalog.clips
  const byId = new Map(clips.map((clip) => [clip.id, clip]))

  console.log('\nA -> A, B -> B, C -> C, D -> D (client URL, host bytes):')
  for (const clip of clips) {
    const ok = store.playClip(clip.id, 'test')
    const playback = store.getSnapshot().playback
    report.check(ok === true, `playClip(${clip.id}) is accepted`)
    report.check(playback.clipId === clip.id, `the store says ${clip.id} is playing`)
    report.check(
      String(playback.url).includes(encodeURIComponent(clip.id)),
      'the URL names that clip',
      String(playback.url),
    )

    const served = await h.request('GET', String(playback.url))
    report.check(served.status === 200, `${clip.id}: the host serves it (200)`)
    report.check(
      served.body.length === clip.bytes,
      `${clip.id}: the bytes are THAT clip (${String(served.body.length)} == ${String(clip.bytes)})`,
    )
    report.check(
      served.headers.etag === `"embedded-${String(clip.version)}"`,
      `${clip.id}: and carry its own validator`,
    )
  }

  console.log('\nswitching A -> B -> C -> D without a reload:')
  {
    const order = ['builtin:brand', 'builtin:cyberpunk', 'builtin:awakening', 'builtin:startup']
    const urls = []
    const sizes = []
    let previousNonce = store.getSnapshot().playback.nonce
    for (const id of order) {
      store.playClip(id, 'switch')
      const playback = store.getSnapshot().playback
      urls.push(playback.url)
      report.check(playback.nonce > previousNonce, `switching to ${id} bumps the nonce (so the element reloads)`)
      previousNonce = playback.nonce
      const served = await h.request('GET', String(playback.url))
      sizes.push(served.body.length)
      report.check(
        served.body.length === byId.get(id).bytes,
        `after switching, ${id} was served (not the previous clip)`,
      )
    }
    report.check(new Set(urls).size === 4, 'the four switches produced four different URLs')
    report.check(new Set(sizes).size === 4, 'and four different byte lengths — no clip was reused')
  }

  console.log('\nreplaying and returning to a clip:')
  {
    store.playClip('builtin:brand', 'first')
    const first = store.getSnapshot().playback
    store.playClip('builtin:cyberpunk', 'other')
    store.playClip('builtin:brand', 'back')
    const back = store.getSnapshot().playback
    report.check(back.clipId === 'builtin:brand', 'returning to the first clip points at it again')
    report.check(back.url === first.url, 'and its URL is identical — so an immutable cache entry is CORRECT')
    report.check(back.nonce > first.nonce + 1, 'while the nonce still advanced, so a replay is not swallowed')
  }

  console.log('\nreplaying the SAME clip twice:')
  {
    store.playClip('builtin:startup', 'again')
    const a = store.getSnapshot().playback
    store.playClip('builtin:startup', 'again')
    const b = store.getSnapshot().playback
    report.check(b.nonce === a.nonce + 1, 'the nonce still advances, so the effect re-runs')
    report.check(b.url === a.url, 'the URL stays the same (nothing about the clip changed)')
  }

  console.log('\nmode-driven playback goes through the same path:')
  {
    await store.selectClip('builtin:awakening')
    await store.playMode('active', 'new-conversation')
    const playback = store.getSnapshot().playback
    report.check(playback.clipId === 'builtin:awakening', 'mode=active plays the selected clip')
    const served = await h.request('GET', String(playback.url))
    report.check(served.body.length === byId.get('builtin:awakening').bytes, 'and the host agrees about which clip that is')

    await store.setRandomPlayback(true)
    const picks = []
    for (let i = 0; i < 12; i += 1) {
      await store.playMode('random', 'random')
      picks.push(store.getSnapshot().playback.clipId)
    }
    report.check(picks.every((id) => typeof id === 'string'), 'random playback always resolves to a clip')
    report.check(new Set(picks).size > 1, `random playback does vary (${String(new Set(picks).size)} distinct)`)
    const repeats = picks.filter((id, index) => index > 0 && id === picks[index - 1])
    report.check(repeats.length === 0, 'and never repeats consecutively')
  }

  console.log('\nstopping:')
  {
    store.stop()
    const playback = store.getSnapshot().playback
    report.check(playback.phase === 'idle', 'stop() returns the player to idle')
    report.check(playback.url === null, 'and clears the URL')
  }
} finally {
  await h.close()
}

report.finish()
