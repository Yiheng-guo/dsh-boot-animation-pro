/**
 * verify-selection.mjs — the selection schema, its migration, and its self-healing.
 *
 * Three claims are tested, and each corresponds to a requirement:
 *
 *   A: `selection.json` holds settings ONLY — never a media path.
 *   B: every historical or damaged shape migrates to a valid current selection.
 *   C: a selection file that cannot be parsed does NOT stop the plugin.
 *
 * The migration is exercised through the REAL exported `migrate()` (a pure
 * function, imported from the built host module) rather than by writing files and
 * inferring, and the end-to-end behaviour is exercised through the REAL routes.
 *
 * Usage: node scripts/verify-selection.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const report = createReport('selection')

const { migrate, SELECTION_VERSION, defaultSelection } = await import(
  pathToFileURL(join(ROOT, 'lib', 'host', 'selection-store.js')).href
)

// ---------------------------------------------------------------- pure migration
console.log('migrate() — pure, no I/O:')
{
  const v1 = migrate({ id: 'builtin:brand', at: '2026-09-25T00:00:00.000Z' })
  report.check(v1.selection.selectedClipId === 'builtin:brand', 'v1 {id} carries its pick forward')
  report.check(v1.selection.version === SELECTION_VERSION, `v1 migrates to version ${String(SELECTION_VERSION)}`)
  report.check(v1.migrated === true, 'v1 reports that it was migrated')
  report.check(!('at' in v1.selection), 'v1 metadata (at) is dropped, not carried into v2')
}
{
  const v2 = migrate({ version: 2, selectedClipId: 'builtin:cyberpunk', randomPlayback: true, fitMode: 'contain' })
  report.check(v2.selection.selectedClipId === 'builtin:cyberpunk', 'v2 passes its pick through')
  report.check(v2.selection.randomPlayback === true, 'v2 passes randomPlayback through')
  report.check(v2.selection.fitMode === 'contain', 'v2 passes fitMode through')
  report.check(
    v2.migrated === true && v2.selection.version === SELECTION_VERSION,
    `a v2 file is migrated to ${String(SELECTION_VERSION)} (it predates every 1.0 setting)`,
  )
  // Every field v2 never had must arrive at a real default rather than undefined:
  // the panel reads them straight off the wire and a missing number is a NaN slider.
  const defaults = defaultSelection()
  const missing = Object.keys(defaults).filter((key) => !(key in v2.selection))
  report.check(missing.length === 0, 'a v2 file gains every current field (with defaults)', missing.join(', '))
  report.check(v2.selection.triggerMode === defaults.triggerMode, 'a v2 file gets the default triggerMode')
  report.check(v2.selection.timeRules.length === 0, 'a v2 file gets an empty schedule, not undefined')
  report.check(v2.selection.sessionList.mode === 'off', 'a v2 file gets an unrestricted session list')
}
{
  // A v3 file is current: nothing to migrate, and no field is invented.
  const v3 = migrate({ ...defaultSelection(), selectedClipId: 'builtin:brand', volume: 0.4, locale: 'en' })
  report.check(v3.migrated === false, 'a current v3 file is not reported as migrated')
  report.check(v3.selection.volume === 0.4 && v3.selection.locale === 'en', 'a current v3 file keeps its values')
}
{
  // Every new field is coerced on the way in, so a hand-edited file cannot put a
  // string into a slider or an unknown value into an enumeration.
  const coerced = migrate({
    version: 3,
    volume: 99,
    playbackRate: 'fast',
    autoSkipSeconds: -4,
    triggerMode: 'sometimes',
    sortMode: 'colour',
    overlayEffect: 'rainbow',
    locale: 'fr',
    overlayTitle: 42,
    favorites: ['builtin:brand', 'builtin:brand', 7],
    timeRules: [
      { clipId: 'builtin:brand', start: '22:00', end: '02:00', days: [5, 5, 9] },
      { clipId: 'builtin:brand', start: '25:00', end: '02:00' },
      { clipId: '../../etc/passwd', start: '01:00', end: '02:00' },
    ],
  })
  report.check(coerced.selection.volume === 1, 'an out-of-range volume is clamped')
  report.check(coerced.selection.playbackRate === 1, 'a non-numeric playbackRate falls back')
  report.check(coerced.selection.autoSkipSeconds === 0, 'a negative auto-skip is clamped to 0')
  report.check(coerced.selection.triggerMode === 'new-and-pinned', 'an unknown triggerMode falls back')
  report.check(coerced.selection.sortMode === 'default', 'an unknown sortMode falls back')
  report.check(coerced.selection.overlayEffect === 'none', 'an unknown effect falls back')
  report.check(coerced.selection.locale === 'auto', 'an unknown locale falls back')
  report.check(coerced.selection.overlayTitle === '', 'a non-string title becomes empty')
  report.check(coerced.selection.favorites.join(',') === 'builtin:brand', 'favourites are de-duplicated and type-checked')
  report.check(coerced.selection.timeRules.length === 1, 'only the one well-formed time rule survives')
  report.check(coerced.selection.timeRules[0].days.join(',') === '5', 'weekday numbers are filtered and de-duplicated')
  report.check(coerced.selection.timeRules[0].start === '22:00', 'a valid window keeps both ends')
  report.check(
    coerced.selection.timeRules[0].clipId === 'builtin:brand',
    'a rule naming a path is dropped, not carried into the settings file',
  )
}
{
  // The rule that matters most: a path is not a ClipId, so it must never be
  // treated as one. Selection files are meant to be portable and hand-editable.
  const withPath = migrate({ id: 'C:\\Users\\someone\\clip.mp4' })
  report.check(withPath.selection.selectedClipId === null, 'a media PATH is rejected as a selection')
  const withSlash = migrate({ selectedClipId: '../../etc/passwd' })
  report.check(withSlash.selection.selectedClipId === null, 'a traversal-looking value is rejected')
}
{
  const corrupt = [
    ['null', null],
    ['a string', 'not json at all'],
    ['an array', ['builtin:brand']],
    ['a number', 42],
  ]
  for (const [label, value] of corrupt) {
    const result = migrate(value)
    report.check(
      result.selection.version === SELECTION_VERSION && result.selection.selectedClipId === null,
      `garbage (${label}) resolves to defaults`,
    )
  }
}
{
  const odd = migrate({ version: 99, selectedClipId: 'builtin:startup', randomPlayback: 'yes', fitMode: 'stretch' })
  report.check(odd.selection.fitMode === 'cover', 'an unknown fitMode falls back to the default')
  report.check(odd.selection.randomPlayback === false, 'a truthy non-boolean is not accepted as a boolean')
  report.check(odd.selection.selectedClipId === 'builtin:startup', 'a known ClipId survives a future version stamp')
}

// ------------------------------------------------------------------ over HTTP
console.log('\nover the real routes:')
{
  const h = await startHarness()
  try {
    const list = (await h.request('GET', '/dsh-boot-animation-pro/videos.json')).json()
    report.check(list.selectionVersion === SELECTION_VERSION, 'the library reports the schema version')
    report.check(list.randomPlayback === false && list.fitMode === 'cover', 'a fresh install reads defaults')

    const first = h.request('POST', '/dsh-boot-animation-pro/select', { body: { selectedClipId: 'builtin:cyberpunk' } })
    const written = (await first).json()
    report.check(written.ok === true, 'select writes successfully')

    const onDisk = JSON.parse(readFileSync(h.selectionFile(), 'utf8'))
    report.check(onDisk.version === SELECTION_VERSION, `the file on disk is version ${String(SELECTION_VERSION)}`)
    report.check(onDisk.selectedClipId === 'builtin:cyberpunk', 'the file records the chosen ClipId')
    /**
     * The file contains SETTINGS ONLY: exactly the schema's fields, no paths, no
     * timestamps, no per-playback state. Compared against the schema rather than
     * against a hand-typed list, so adding a field updates this check by itself
     * and REMOVING one still fails here.
     */
    const expectedKeys = Object.keys(defaultSelection()).sort().join(',')
    report.check(
      Object.keys(onDisk).sort().join(',') === expectedKeys,
      'the file contains the schema fields and nothing else (no paths, no timestamps)',
      `on disk: ${Object.keys(onDisk).join(', ')}\n         schema : ${expectedKeys}`,
    )

    const patch = await h.request('POST', '/dsh-boot-animation-pro/select', { body: { randomPlayback: true, fitMode: 'contain' } })
    const patched = patch.json()
    report.check(
      patched.randomPlayback === true && patched.fitMode === 'contain' && patched.selectedClipId === 'builtin:cyberpunk',
      'a partial write changes only the named fields',
    )

    // The v1 spelling still works: installed copies POST {id}.
    const legacy = await h.request('POST', '/dsh-boot-animation-pro/select', { body: { id: 'builtin:brand' } })
    report.check(legacy.json().selectedClipId === 'builtin:brand', 'the legacy {id} body still selects')

    const bad = await h.request('POST', '/dsh-boot-animation-pro/select', { body: { selectedClipId: 'builtin:nope' } })
    report.check(bad.status === 404, 'selecting an unknown ClipId is 404')
    const pathy = await h.request('POST', '/dsh-boot-animation-pro/select', { body: { selectedClipId: 'C:/x.mp4' } })
    report.check(pathy.status === 400, 'selecting a PATH is 400')
    const nothing = await h.request('POST', '/dsh-boot-animation-pro/select', { body: {} })
    report.check(nothing.status === 400, 'an empty patch is 400')
    const notPost = await h.request('GET', '/dsh-boot-animation-pro/select')
    report.check(notPost.status === 405, 'GET on select is 405')
    const badJson = await h.request('POST', '/dsh-boot-animation-pro/select', { body: '{not json', raw: true })
    report.check(badJson.status === 400, 'malformed JSON is 400, not a crash')
  } finally {
    await h.close()
  }
}

// ------------------------------------------------------- damaged file on disk
console.log('\na damaged selection file:')
{
  const home = join(process.env.TEMP ?? process.env.TMP ?? '.', 'dba-selection-' + String(Date.now()))
  mkdirSync(join(home, 'boot-animation-pro'), { recursive: true })
  writeFileSync(join(home, 'boot-animation-pro', 'selection.json'), '{ this is not json', 'utf8')
  const h = await startHarness({ home })
  try {
    const response = await h.request('GET', '/dsh-boot-animation-pro/videos.json')
    report.check(response.status === 200, 'the plugin still serves the library')
    report.check(response.json().selectedClipId === null, 'and reports defaults rather than failing')
    const status = (await h.request('GET', '/dsh-boot-animation-pro/status.json')).json()
    const kinds = status.diagnostics.events.map((event) => event.kind)
    report.check(
      kinds.includes('selection-unreadable') && kinds.includes('selection-reset'),
      'the damage is reported through diagnostics',
      kinds.join(', '),
    )
    const repaired = JSON.parse(readFileSync(join(home, 'boot-animation-pro', 'selection.json'), 'utf8'))
    report.check(
      repaired.version === SELECTION_VERSION,
      `the file is rewritten as a valid v${String(SELECTION_VERSION)} selection`,
    )
    // A path must never survive a round trip, even from a legacy file.
    writeFileSync(join(home, 'boot-animation-pro', 'selection.json'), JSON.stringify({ id: 'D:/movies/a.mp4' }))
    const second = await startHarness({ home })
    const list2 = (await second.request('GET', '/dsh-boot-animation-pro/videos.json')).json()
    report.check(list2.selectedClipId === null, 'a legacy file carrying a path migrates to "nothing selected"')
    await second.close()
  } finally {
    await h.close()
    rmSync(home, { recursive: true, force: true })
  }
}

report.finish()
