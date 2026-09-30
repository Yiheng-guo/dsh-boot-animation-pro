/**
 * verify-preview.mjs — previewing A/B/C/D plays A/B/C/D, and selects nothing.
 *
 * This is the suite for the reported defect "the four clips are listed
 * differently but previewing them all plays the same video". The cause was
 * structural: the only playback URL was `/boot.mp4`, resolved to "whatever is
 * active", and the single preview button simply reopened the overlay. The picker
 * could not name a clip at all.
 *
 * So the assertions are about identity and about non-interference:
 *
 *   - preview(X) points the player at X, for each of the four clips;
 *   - previewing does NOT change the selection (auditioning is not choosing);
 *   - the four preview URLs are four distinct resources;
 *   - none of them is the shared legacy URL.
 *
 * It drives the SHIPPED bundle's own store, not a reimplementation.
 *
 * Usage: node scripts/verify-preview.mjs
 */
import { builtinClips, loadClientBundle, makeFetchStub } from './lib/client-bundle.mjs'
import { createReport } from './lib/harness.mjs'

const report = createReport('preview')
const bundle = loadClientBundle()
report.check(typeof bundle.ClientStore === 'function', 'the bundle exports the real ClientStore')
report.check(typeof bundle.mediaUrlFor === 'function', 'the bundle exports the real mediaUrlFor')

const clips = builtinClips()

/** A store wired to a stub host, already loaded. */
async function makeStore(selectedClipId = null) {
  const { fetchStub, calls, state } = makeFetchStub({ clips, selectedClipId })
  globalThis.fetch = fetchStub
  const store = new bundle.ClientStore()
  await store.loadCatalog()
  return { store, calls, state }
}

console.log('the catalog loads:')
{
  const { store } = await makeStore('builtin:brand')
  const snapshot = store.getSnapshot()
  report.check(snapshot.catalog?.clips.length === 4, 'four clips are in the catalog')
  report.check(snapshot.settings.selectedClipId === 'builtin:brand', 'the stored selection is read')
}

console.log('\npreviewing each clip points the player at THAT clip:')
{
  const { store } = await makeStore('builtin:brand')
  const urls = new Map()
  for (const clip of clips) {
    const ok = store.preview(clip.id)
    const playback = store.getSnapshot().playback
    report.check(ok === true, `preview(${clip.id}) is accepted`)
    report.check(playback.clipId === clip.id, `preview(${clip.id}) points the player at it`)
    report.check(
      typeof playback.url === 'string' && playback.url.includes(encodeURIComponent(clip.id)),
      `preview(${clip.id}) builds a URL that names it`,
      String(playback.url),
    )
    report.check(
      playback.previewClipId === clip.id,
      `preview(${clip.id}) is recorded as the clip being auditioned`,
    )
    urls.set(clip.id, playback.url)
  }
  report.check(new Set(urls.values()).size === 4, 'the four preview URLs are four distinct resources')
  report.check(
    [...urls.values()].every((url) => !String(url).includes('boot.mp4')),
    'no preview uses the shared legacy URL',
  )
}

console.log('\npreviewing never becomes the selection:')
{
  const { store, state } = await makeStore('builtin:brand')
  for (const clip of clips) store.preview(clip.id)
  report.check(
    store.getSnapshot().settings.selectedClipId === 'builtin:brand',
    'the selection is still the original clip after previewing all four',
  )
  report.check(state.selectedClipId === 'builtin:brand', 'and the host was never told otherwise')

  const chosen = await store.selectClip('builtin:startup')
  report.check(chosen === true, 'selecting does persist')
  report.check(store.getSnapshot().settings.selectedClipId === 'builtin:startup', 'the selection follows the choice')

  store.preview('builtin:awakening')
  report.check(
    store.getSnapshot().settings.selectedClipId === 'builtin:startup',
    'previewing after a choice leaves that choice alone',
  )
  report.check(store.getSnapshot().playback.clipId === 'builtin:awakening', 'while still playing what was previewed')
}

console.log('\nA/B/C/D stay distinct even when interleaved with the selection:')
{
  const { store } = await makeStore('builtin:cyberpunk')
  const seen = []
  for (const clip of clips) {
    store.preview(clip.id)
    seen.push(store.getSnapshot().playback.url)
  }
  report.check(
    seen.every((url, index) => String(url).includes(encodeURIComponent(clips[index].id))),
    'the nth preview played the nth clip',
  )
  report.check(new Set(seen).size === 4, 'and produced four different URLs')
}

console.log('\ndegrading safely:')
{
  const { store } = await makeStore('builtin:brand')
  store.preview('builtin:brand')
  const before = store.getSnapshot().playback
  const ok = store.preview('builtin:does-not-exist')
  report.check(ok === false, 'previewing an unknown clip is refused')
  const after = store.getSnapshot().playback
  report.check(after.clipId === before.clipId && after.url === before.url, 'and the player is left as it was')
}

report.finish()
