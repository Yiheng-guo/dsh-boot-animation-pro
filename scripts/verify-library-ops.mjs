/**
 * verify-library-ops.mjs — deleting a user's file, and everything that refuses to.
 *
 * `POST /remove` is the only operation in this plugin that destroys data the user
 * created. The rest of the plugin can be wrong and cost someone a re-selection;
 * this one can cost them a file. So it is written to refuse far more often than
 * it succeeds, and every refusal is tested here.
 *
 * The four gates (`library-ops.js`) are checked BOTH ways:
 *
 *   - directly, with crafted clip records, so a gate cannot be bypassed by a
 *     caller that never went through the route;
 *   - over the real route, so the wiring is exercised too.
 *
 * Sorting and the read-only legacy directory are checked here as well: both are
 * library management (feature C) and both are about what the panel presents.
 *
 * Usage: node scripts/verify-library-ops.mjs
 */
import { existsSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/dsh-boot-animation-pro'
const report = createReport('library ops')

const { isRemovable, ownerDirOf, removeClipFile } = await import(
  pathToFileURL(join(ROOT, 'lib', 'host', 'library-ops.js')).href
)

console.log('the gates, driven directly:')
{
  const scratch = join(process.env.TEMP ?? process.env.TMP ?? '.', 'dba-libops-' + String(Date.now()))
  const managed = join(scratch, 'managed')
  const outside = join(scratch, 'outside')
  mkdirSync(managed, { recursive: true })
  mkdirSync(outside, { recursive: true })
  const inside = join(managed, 'a.mp4')
  const escapee = join(outside, 'b.mp4')
  writeFileSync(inside, 'x')
  writeFileSync(escapee, 'y')

  const dirs = [{ source: 'yours', dir: managed, writable: true }]
  const fileClip = (path) => ({ kind: 'file', path, name: 'a' })

  try {
    report.check(isRemovable(fileClip(inside), dirs) === true, 'a file in a writable directory is removable')
    report.check(isRemovable(fileClip(escapee), dirs) === false, 'a file outside every managed directory is not')
    report.check(
      isRemovable(fileClip(inside), [{ source: 'yours', dir: managed, writable: false }]) === false,
      'nor is one in a directory the plugin does not manage',
    )
    report.check(isRemovable({ kind: 'embedded', path: null }, dirs) === false, 'an embedded clip has no file to remove')
    report.check(isRemovable(fileClip(''), dirs) === false, 'a clip with no path is not removable')
    report.check(ownerDirOf(fileClip(inside), dirs)?.writable === true, 'ownerDirOf names the directory that owns a file, and whether it is ours')
    report.check(ownerDirOf(fileClip(escapee), dirs) === null, 'and returns null for one it does not own')

    // A directory whose name ends in .mp4 must never be unlinked.
    const dirAsClip = join(managed, 'trap.mp4')
    mkdirSync(dirAsClip, { recursive: true })
    let error = null
    try {
      removeClipFile(fileClip(dirAsClip), dirs)
    } catch (caught) {
      error = caught
    }
    report.check(error !== null, 'a directory named like a video is refused')
    report.check(existsSync(dirAsClip), 'and it is still there')

    // A symlinked video is unlinked as a LINK: the target is untouched.
    const link = join(managed, 'link.mp4')
    symlinkSync(escapee, link)
    removeClipFile(fileClip(link), dirs)
    report.check(!existsSync(link), 'a symlinked clip is removed from the library directory')
    report.check(existsSync(escapee), 'while the file it pointed at is left alone')

    error = null
    try {
      removeClipFile(fileClip(escapee), dirs)
    } catch (caught) {
      error = caught
    }
    report.check(error !== null && error.status === 403, 'an out-of-directory delete is refused with a 403 hint', String(error?.status))
    report.check(
      error !== null && error.message.includes('outside'),
      'and that refusal is worded differently from the read-only-directory one',
      String(error?.message),
    )
    report.check(existsSync(escapee), 'and the file survives the attempt')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

console.log('\nover the real route:')
{
  const h = await startHarness()
  try {
    // A file the plugin manages, plus one in the PREVIOUS version's directory.
    const mine = h.put('mine.mp4', Buffer.from('a'.repeat(120)))
    const legacyDir = join(h.home, 'boot-animation', 'videos')
    mkdirSync(legacyDir, { recursive: true })
    const inherited = join(legacyDir, 'inherited.mp4')
    writeFileSync(inherited, 'b'.repeat(80))

    const list = (await h.request('GET', `${BASE}/videos.json`)).json()
    const row = (name) => list.videos.find((entry) => entry.file === name)
    const mineRow = row('mine.mp4')
    const inheritedRow = row('inherited.mp4')
    report.check(mineRow?.removable === true, 'the plugin\'s own directory yields a removable row')
    report.check(inheritedRow?.removable === false, "the previous version's directory yields a read-only row")
    report.check(inheritedRow?.source === 'legacy', 'and is labelled as belonging to the old layout', String(inheritedRow?.source))

    console.log('\nrefusals first:')
    {
      const get = await h.request('GET', `${BASE}/remove`)
      report.check(get.status === 405, 'GET on a destructive route is 405')
      const empty = await h.request('POST', `${BASE}/remove`, { body: {} })
      report.check(empty.status === 400, 'a body with no clipId is 400')
      const pathy = await h.request('POST', `${BASE}/remove`, { body: { clipId: 'C:/x.mp4' } })
      report.check(pathy.status === 400, 'a path is not a ClipId')
      const unknown = await h.request('POST', `${BASE}/remove`, { body: { clipId: 'nope' } })
      report.check(unknown.status === 404, 'an unknown clip is 404')
      const embedded = await h.request('POST', `${BASE}/remove`, { body: { clipId: 'builtin:brand' } })
      report.check(embedded.status === 400, 'an embedded clip is refused', embedded.text)
      const readOnly = await h.request('POST', `${BASE}/remove`, { body: { clipId: inheritedRow.id } })
      report.check(readOnly.status === 403, "a clip in the old layout's directory is refused", readOnly.text)
      report.check(
        readOnly.json().error.includes('previous version'),
        'and the refusal says WHY, instead of claiming the file is outside every directory',
        readOnly.json().error,
      )
      report.check(existsSync(inherited), 'and that file is untouched')
      for (const response of [empty, pathy, unknown, embedded, readOnly]) {
        report.check(
          String(response.headers['cache-control'] ?? '').includes('no-store'),
          'every refusal is uncacheable',
        )
      }
      const afterRefusals = (await h.request('GET', `${BASE}/videos.json`)).json()
      report.check(afterRefusals.videos.some((entry) => entry.file === 'inherited.mp4'), 'the read-only clip is still listed')
    }

    console.log('\nthe one deletion that is allowed:')
    {
      // Select it first: deleting the selected clip must not leave a dangling pick.
      await h.request('POST', `${BASE}/select`, { body: { selectedClipId: mineRow.id } })
      const before = (await h.request('GET', `${BASE}/videos.json`)).json()
      report.check(before.selectedClipId === mineRow.id, 'the user file can be selected')

      const removed = await h.request('POST', `${BASE}/remove`, { body: { clipId: mineRow.id } })
      report.check(removed.status === 200 && removed.json().ok === true, 'the file is removed', removed.text)
      report.check(!existsSync(mine), 'and it is gone from disk', mine)
      report.check(
        String(removed.headers['cache-control'] ?? '').includes('no-store'),
        'the success reply is uncacheable too (a cached 200 would lie about the next file)',
      )

      const after = (await h.request('GET', `${BASE}/videos.json`)).json()
      report.check(!after.videos.some((entry) => entry.id === mineRow.id), 'it is gone from the listing')
      report.check(after.selectedClipId === null, 'and the selection that pointed at it was cleared')
      report.check(after.activeId !== mineRow.id, 'so the active clip is not a file that no longer exists')

      const again = await h.request('POST', `${BASE}/remove`, { body: { clipId: mineRow.id } })
      report.check(again.status === 404, 'removing it a second time is 404, not a crash')
      report.check((await h.request('GET', `${BASE}/videos.json`)).status === 200, 'and the plugin is still serving')
    }

    console.log('\nsorting:')
    {
      // Three files with distinct sizes and distinct, explicit mtimes.
      const sizes = { oldest: 300, middle: 200, newest: 100 }
      const stamps = { oldest: 1_600_000_000, middle: 1_700_000_000, newest: 1_800_000_000 }
      for (const [name, size] of Object.entries(sizes)) {
        const path = h.put(`${name}.mp4`, Buffer.from('z'.repeat(size)))
        utimesSync(path, stamps[name], stamps[name])
      }

      const namesIn = async (mode) => {
        await h.request('POST', `${BASE}/select`, { body: { sortMode: mode } })
        const payload = (await h.request('GET', `${BASE}/videos.json`)).json()
        return payload.videos.filter((entry) => entry.source === 'yours' && entry.kind === 'file').map((entry) => entry.originalName)
      }

      report.check((await namesIn('name')).join(',') === 'middle,newest,oldest', 'sortMode=name orders by display name')
      report.check((await namesIn('size')).join(',') === 'oldest,middle,newest', 'sortMode=size orders largest first')
      report.check((await namesIn('newest')).join(',') === 'newest,middle,oldest', 'sortMode=newest orders by mtime descending')
      report.check((await namesIn('oldest')).join(',') === 'oldest,middle,newest', 'sortMode=oldest reverses it')

      // A favourite floats to the top of whatever ordering is active.
      const middle = (await h.request('GET', `${BASE}/videos.json`)).json().videos.find((entry) => entry.originalName === 'middle')
      await h.request('POST', `${BASE}/select`, { body: { sortMode: 'name' } })
      await h.request('POST', `${BASE}/select`, { body: { toggleFavorite: middle.id } })
      const withStar = (await h.request('GET', `${BASE}/videos.json`)).json()
        .videos.filter((entry) => entry.source === 'yours' && entry.kind === 'file')
        .map((entry) => entry.originalName)
      report.check(withStar[0] === 'middle', 'a favourite is first under an explicit ordering', withStar.join(','))

      await h.request('POST', `${BASE}/select`, { body: { sortMode: 'default' } })
      const defaultOrder = (await h.request('GET', `${BASE}/videos.json`)).json()
        .videos.filter((entry) => entry.source === 'yours' && entry.kind === 'file')
        .map((entry) => entry.originalName)
      report.check(defaultOrder.join(',') === 'newest,middle,oldest', 'sortMode=default keeps newest-first for the user\'s clips', defaultOrder.join(','))
    }
  } finally {
    await h.close()
  }
}

report.finish()
