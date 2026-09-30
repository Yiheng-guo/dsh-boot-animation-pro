/**
 * verify-settings.mjs — the settings schema, both halves of it.
 *
 * The schema exists twice on purpose: `src/host/settings.js` is the authority the
 * routes enforce, and `src/client/store.ts` carries typed mirrors of the
 * enumerations so the panel can render them without a lookup. Duplication is only
 * safe when drift is impossible to ship, so this file CARRIES THE LISTS ACROSS and
 * fails if they differ.
 *
 * It then exercises the two write policies the schema defines, because they are
 * deliberately different and the difference is the whole safety story:
 *
 *   migrateSelection  never throws — a hand-edited file cannot stop the plugin;
 *   applyPatch        always throws — a wire patch we ship is either right or loud.
 *
 * Usage: node scripts/verify-settings.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/dsh-boot-animation-pro'
const report = createReport('settings schema')

const settings = await import(pathToFileURL(join(ROOT, 'lib', 'host', 'settings.js')).href)
const clientSource = readFileSync(join(ROOT, 'src', 'client', 'store.ts'), 'utf8')

/**
 * Read one `export const X = ['a', 'b'] as const` array out of the client source.
 *
 * A regex over TypeScript is a blunt tool, and it is the right one here: the
 * alternative is to import the browser bundle, whose enumerations are not
 * exported as data. A parse failure is reported as a failure, never skipped, so
 * renaming the constant cannot silently retire the check.
 */
function clientList(name) {
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const`).exec(clientSource)
  if (match === null) return null
  return [...match[1].matchAll(/'([^']*)'/g)].map((entry) => entry[1])
}

console.log('the host and the client agree on every enumeration:')
for (const [name, hostList] of [
  ['FIT_MODES', settings.FIT_MODES],
  ['TRIGGER_MODES', settings.TRIGGER_MODES],
  ['SORT_MODES', settings.SORT_MODES],
  ['OVERLAY_EFFECTS', settings.OVERLAY_EFFECTS],
  ['LOCALES', settings.LOCALES],
  ['SESSION_LIST_MODES', settings.SESSION_LIST_MODES],
]) {
  const mirrored = clientList(name)
  report.check(mirrored !== null, `the client still declares ${name}`)
  report.check(
    mirrored !== null && mirrored.join(',') === hostList.join(','),
    `${name} is identical on both sides (order included — the panel renders it in order)`,
    `host   : ${hostList.join(', ')}\n         client : ${mirrored === null ? '(missing)' : mirrored.join(', ')}`,
  )
}

console.log('\npatch validation is loud:')
{
  const patched = (current, patch) => settings.applyPatch(current, patch, { knownClipIds: new Set(['builtin:brand']) })
  const ok = (label, fn) => {
    let threw = null
    try {
      fn()
    } catch (error) {
      threw = error
    }
    report.check(threw === null, label, threw === null ? '' : String(threw.message))
  }
  const rejects = (label, fn, expectedStatus = null) => {
    let error = null
    try {
      fn()
    } catch (caught) {
      error = caught
    }
    const okStatus = expectedStatus === null || error?.status === expectedStatus
    report.check(error !== null && okStatus, label, error === null ? 'accepted, should have been refused' : `status ${String(error.status)}`)
  }

  const base = settings.defaultSettings()
  ok('a valid patch is accepted', () => patched(base, { volume: 0.5, triggerMode: 'always' }))
  rejects('an unknown key is refused', () => patched(base, { nope: 1 }))
  rejects('the schema version is not a settable field', () => patched(base, { version: 2 }))
  rejects('the legacy `id` key is not a settings field', () => patched(base, { id: 'builtin:brand' }))
  rejects('an unknown clip is 404', () => patched(base, { selectedClipId: 'builtin:nope' }), 404)
  rejects('a path is not a ClipId', () => patched(base, { selectedClipId: 'C:/x.mp4' }))
  rejects('an unknown triggerMode is refused', () => patched(base, { triggerMode: 'sometimes' }))
  rejects('a non-boolean muted is refused', () => patched(base, { muted: 'yes' }))
  rejects('a non-numeric volume is refused', () => patched(base, { volume: 'loud' }))
  rejects('a bad time is refused', () => patched(base, { addTimeRule: { clipId: 'builtin:brand', start: '25:00', end: '02:00' } }))
  rejects('a time rule for an unknown clip is 404', () => patched(base, { addTimeRule: { clipId: 'builtin:nope', start: '01:00', end: '02:00' } }), 404)
  rejects('removing a rule that does not exist is refused', () => patched(base, { removeTimeRule: 'rule-nope' }))
  rejects('a session id with a separator is refused', () => patched(base, { sessionList: { mode: 'deny', ids: ['../etc'] } }))
  rejects('an unknown session list mode is refused', () => patched(base, { sessionList: { mode: 'maybe', ids: [] } }))
  rejects('a favourite that is not a clip is 404', () => patched(base, { favorites: ['builtin:nope'] }), 404)

  console.log('\noperations are read-modify-write on the host:')
  const aliased = patched(base, { alias: { clipId: 'builtin:brand', name: '品牌片头' } })
  report.check(aliased.aliases['builtin:brand'] === '品牌片头', 'alias sets a display name')
  const cleared = patched(aliased, { alias: { clipId: 'builtin:brand', name: '' } })
  report.check(!('builtin:brand' in cleared.aliases), 'an empty alias clears the name')

  const favourited = patched(base, { toggleFavorite: 'builtin:brand' })
  report.check(favourited.favorites.includes('builtin:brand'), 'toggleFavorite adds')
  const unfavourited = patched(favourited, { toggleFavorite: 'builtin:brand' })
  report.check(!unfavourited.favorites.includes('builtin:brand'), 'and removes on the second call')

  const added = patched(base, { addTimeRule: { clipId: 'builtin:brand', days: [5], start: '22:00', end: '02:00' } })
  report.check(added.timeRules.length === 1, 'addTimeRule appends')
  report.check(typeof added.timeRules[0].id === 'string' && added.timeRules[0].id !== '', 'the host generates the rule id')
  const removed = patched(added, { removeTimeRule: added.timeRules[0].id })
  report.check(removed.timeRules.length === 0, 'removeTimeRule removes it by the generated id')

  const listed = patched(base, { sessionListOp: { op: 'add', id: 'session-1' } })
  report.check(listed.sessionList.ids.join(',') === 'session-1', 'sessionListOp adds a session')
  const delisted = patched(listed, { sessionListOp: { op: 'remove', id: 'session-1' } })
  report.check(delisted.sessionList.ids.length === 0, 'sessionListOp removes it again')

  console.log('\nnothing mutates the object it was given:')
  const before = JSON.stringify(base)
  patched(base, { volume: 0.1, toggleFavorite: 'builtin:brand', addTimeRule: { clipId: 'builtin:brand', start: '01:00', end: '02:00' } })
  report.check(JSON.stringify(base) === before, 'applyPatch is pure — the caller\'s settings are untouched')
}

console.log('\nthe client coerces the same wire payload:')
{
  const { loadClientBundle } = await import('./lib/client-bundle.mjs')
  const bundle = loadClientBundle()
  const { normaliseSettings, DEFAULT_SETTINGS } = bundle
  report.check(typeof normaliseSettings === 'function', 'the bundle exports the client-side normaliser')

  const garbage = normaliseSettings({
    version: 3,
    selectedClipId: 42,
    randomPlayback: 'yes',
    fitMode: 'stretch',
    volume: 99,
    muted: 'no',
    playbackRate: Number.NaN,
    triggerMode: 'sometimes',
    sessionList: { mode: 'maybe', ids: ['a', 7, null] },
    aliases: { 'builtin:brand': 'ok', 'builtin:other': 5 },
    favorites: ['builtin:brand', 3],
    sortMode: 'colour',
    overlayTitle: 12,
    overlayEffect: 'rainbow',
    timeRules: [{ id: 'r1', clipId: 'builtin:brand', start: '01:00', end: '02:00' }, { id: 7 }, null],
    locale: 'fr',
  })
  report.check(garbage.selectedClipId === null, 'a non-string selection becomes null')
  report.check(garbage.randomPlayback === false, 'a truthy non-boolean becomes false')
  report.check(garbage.fitMode === 'cover', 'an unknown fit mode becomes the default')
  report.check(garbage.volume === 1, 'an out-of-range number is clamped')
  report.check(garbage.playbackRate === DEFAULT_SETTINGS.playbackRate, 'a NaN falls back to the default')
  report.check(garbage.triggerMode === DEFAULT_SETTINGS.triggerMode, 'an unknown trigger mode falls back')
  report.check(garbage.sessionList.mode === 'off' && garbage.sessionList.ids.join(',') === 'a', 'a malformed session list is repaired')
  report.check(Object.keys(garbage.aliases).join(',') === 'builtin:brand', 'only string aliases survive')
  report.check(garbage.favorites.join(',') === 'builtin:brand', 'non-string favourites are dropped')
  report.check(garbage.sortMode === 'default' && garbage.overlayEffect === 'none', 'unknown enumerations fall back')
  report.check(garbage.overlayTitle === '', 'a non-string caption becomes empty, not "undefined"')
  report.check(garbage.timeRules.length === 1, 'only fully-formed time rules survive')
  report.check(garbage.locale === 'auto', 'an unsupported locale falls back to auto')

  report.check(normaliseSettings(null).volume === DEFAULT_SETTINGS.volume, 'a null payload yields the defaults')
  report.check(normaliseSettings('nope').triggerMode === DEFAULT_SETTINGS.triggerMode, 'and so does a non-object')
  report.check(normaliseSettings({}).timeRules.length === 0, 'a payload missing a field gets a usable value, never undefined')
}

console.log('\nover the real routes:')
{
  const h = await startHarness()
  try {
    const post = async (body) => {
      const response = await h.request('POST', `${BASE}/select`, { body })
      return { status: response.status, json: response.json() }
    }
    const listed = (await h.request('GET', `${BASE}/videos.json`)).json()
    report.check(listed.schema?.version === settings.SELECTION_VERSION, 'the listing publishes the schema version')
    report.check(Array.isArray(listed.schema?.triggerModes), 'and the enumerations, so a stale client can offer only valid values')
    report.check(listed.settings?.volume === 1, 'the whole settings object travels with the listing')

    const saved = await post({ overlayTitle: 'DSH', overlaySubtitle: '启动中', watermark: '@pro', overlayEffect: 'glow' })
    report.check(saved.status === 200 && saved.json.settings.overlayEffect === 'glow', 'the new overlay settings save over the wire')

    const bad = await post({ overlayEffect: 'rainbow' })
    report.check(bad.status === 400, 'an unknown effect is refused with 400')
    const unknownClip = await post({ selectedClipId: 'builtin:nope' })
    report.check(unknownClip.status === 404, 'an unknown clip is refused with 404')
    const unknownField = await post({ nonsense: true })
    report.check(unknownField.status === 400, 'an unknown field is refused rather than ignored')

    {
      // The panel's own flow: rename, star, then read both back.
      const before = (await h.request('GET', `${BASE}/videos.json`)).json()
      const originalName = before.videos.find((entry) => entry.id === 'builtin:brand')?.name

      await post({ alias: { clipId: 'builtin:brand', name: '我的片头' } })
      await post({ toggleFavorite: 'builtin:brand' })
      const after = (await h.request('GET', `${BASE}/videos.json`)).json()
      const row = after.videos.find((entry) => entry.id === 'builtin:brand')
      report.check(row?.name === '我的片头', 'a rename is reflected in the listing')
      report.check(
        row?.originalName === originalName && originalName !== '我的片头',
        'and the pre-rename name is still published as originalName',
        String(row?.originalName),
      )
      report.check(row?.renamed === true, 'and the row is marked as renamed')
      report.check(row?.favorite === true, 'and the favourite flag survives the round trip')
      report.check(after.videos[0].id === 'builtin:brand', 'the favourite floats to the top of the list')
    }
  } finally {
    await h.close()
  }
}

console.log('\nthe previous version\'s file is adopted once:')
{
  const home = join(process.env.TEMP ?? process.env.TMP ?? '.', 'dba-settings-' + String(Date.now()))
  mkdirSync(join(home, 'boot-animation'), { recursive: true })
  writeFileSync(
    join(home, 'boot-animation', 'selection.json'),
    JSON.stringify({ version: 2, selectedClipId: 'builtin:cyberpunk', randomPlayback: true, fitMode: 'contain' }),
    'utf8',
  )
  const h = await startHarness({ home })
  try {
    const list = (await h.request('GET', `${BASE}/videos.json`)).json()
    report.check(list.selectedClipId === 'builtin:cyberpunk', 'the predecessor\'s pick is carried over')
    report.check(list.randomPlayback === true && list.fitMode === 'contain', 'and so are its other settings')
    report.check(list.settings.triggerMode === 'new-and-pinned', 'a setting the predecessor never had gets its default')

    const own = join(home, 'boot-animation-pro', 'selection.json')
    const migrated = JSON.parse(readFileSync(own, 'utf8'))
    report.check(migrated.version === settings.SELECTION_VERSION, 'our own file is written at the current version')
    report.check(migrated.selectedClipId === 'builtin:cyberpunk', 'and carries the imported pick')

    // The predecessor is never written back to: it still belongs to the other plugin.
    const predecessor = JSON.parse(readFileSync(join(home, 'boot-animation', 'selection.json'), 'utf8'))
    report.check(predecessor.version === 2, 'the predecessor file is left exactly as it was')
  } finally {
    await h.close()
    rmSync(home, { recursive: true, force: true })
  }
}

report.finish()
