/**
 * verify-schedule.mjs — "play this clip during these hours" (feature E).
 *
 * Two layers, tested separately because they fail differently:
 *
 *   schedule.js       the window arithmetic, driven by an explicit Date. This is
 *                     where the subtle part lives: what "Friday 22:00 → 02:00"
 *                     means at 01:00 on Saturday morning.
 *   clip-resolver.js  the priority rule, driven through the real route. A time
 *                     rule must outrank random playback, and a rule pointing at a
 *                     clip that no longer exists must fall through rather than
 *                     resolve to nothing.
 *
 * Usage: node scripts/verify-schedule.mjs
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/dsh-boot-animation-pro'
const report = createReport('schedule')

const { pickScheduledRule, ruleMatches } = await import(
  pathToFileURL(join(ROOT, 'lib', 'host', 'schedule.js')).href
)

/** A local Date for one weekday/time pair. 2026-01-04 is a Sunday. */
function at(day, hours, minutes) {
  const base = new Date(2026, 0, 4 + day, hours, minutes, 0, 0)
  // Guard the fixture itself: if this ever stops landing on `day`, every
  // assertion below would be testing the wrong weekday.
  if (base.getDay() !== day) throw new Error(`fixture broke: wanted day ${String(day)}, got ${String(base.getDay())}`)
  return base
}

const rule = (over = {}) => ({ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5], enabled: true, ...over })

console.log('day windows:')
{
  const r = rule()
  report.check(ruleMatches(r, at(1, 9, 0)) === true, 'the start of the window is inside it')
  report.check(ruleMatches(r, at(1, 17, 59)) === true, 'the last minute before the end is inside it')
  report.check(ruleMatches(r, at(1, 18, 0)) === false, 'the end itself is outside it — the window is half-open')
  report.check(ruleMatches(r, at(1, 8, 59)) === false, 'one minute before the start is outside it')
  report.check(ruleMatches(r, at(6, 12, 0)) === false, 'a weekday not listed is outside it')
  report.check(ruleMatches(r, at(0, 12, 0)) === false, 'Sunday is outside a Mon-Fri rule')
}

console.log('\nwindows that cross midnight:')
{
  // Friday night: starts Friday 22:00, ends Saturday 02:00.
  const fridayNight = rule({ start: '22:00', end: '02:00', days: [5] })
  report.check(ruleMatches(fridayNight, at(5, 22, 0)) === true, 'Friday 22:00 is inside "Friday night"')
  report.check(ruleMatches(fridayNight, at(5, 23, 59)) === true, 'Friday 23:59 is still inside it')
  report.check(
    ruleMatches(fridayNight, at(6, 1, 0)) === true,
    'Saturday 01:00 is inside it — the window that is running began on Friday',
  )
  report.check(ruleMatches(fridayNight, at(6, 2, 0)) === false, 'Saturday 02:00 is the end, so outside it')
  report.check(ruleMatches(fridayNight, at(5, 21, 59)) === false, 'Friday 21:59 is before it')
  report.check(
    ruleMatches(fridayNight, at(4, 23, 0)) === false,
    'Thursday 23:00 is outside it — the wrap does not leak into the day before',
  )
  report.check(
    ruleMatches({ ...fridayNight, days: [0, 1, 2, 3, 4, 5, 6] }, at(3, 1, 0)) === true,
    'with every day listed, a Wednesday small-hours window matches (started Tuesday)',
  )
}

console.log('\ndegenerate rules never match:')
{
  report.check(ruleMatches(rule({ start: '09:00', end: '09:00' }), at(1, 9, 0)) === false, 'a zero-width window never matches')
  report.check(ruleMatches(rule({ enabled: false }), at(1, 12, 0)) === false, 'a disabled rule never matches')
}

console.log('\nfirst match wins:')
{
  const rules = [
    rule({ start: '09:00', end: '10:00', days: [1], label: 'first' }),
    rule({ start: '09:00', end: '18:00', days: [1], label: 'second' }),
  ]
  report.check(pickScheduledRule(rules, at(1, 9, 30))?.label === 'first', 'the earlier rule in the list wins')
  report.check(pickScheduledRule(rules, at(1, 11, 0))?.label === 'second', 'a rule that does not match is skipped')
  report.check(pickScheduledRule([], at(1, 9, 0)) === null, 'no rules means no match')
  report.check(pickScheduledRule(rules, at(3, 9, 30)) === null, 'a day with no matching rule means no match')
}

console.log('\nover the real routes:')
{
  const h = await startHarness()
  try {
    const post = async (body) => (await h.request('POST', `${BASE}/select`, { body })).json()
    const resolve = async (mode) => (await h.request('GET', `${BASE}/resolve.json?mode=${mode}`)).json()

    // A window that certainly contains "now", whatever time the suite runs at.
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    if (minutes >= 23 * 60 + 59) {
      console.log('  skip  running at 23:59; a 00:00-23:59 window would exclude this minute')
    } else {
      const day = [now.getDay()]
      const bytes = Buffer.from('not really an mp4, but a real non-empty file')
      h.put('scheduled-clip.mp4', bytes)
      const listing = (await h.request('GET', `${BASE}/videos.json`)).json()
      const fileClip = listing.videos.find((entry) => entry.bytes === bytes.length && entry.source === 'yours')
      report.check(fileClip !== undefined, 'a user file is listed and addressable')

      // Rule A names the user's own file and is added first, so it wins.
      await post({ addTimeRule: { clipId: fileClip.id, days: day, start: '00:00', end: '23:59', label: 'A' } })
      const firstHit = await resolve('schedule')
      report.check(firstHit.clipId === fileClip.id, 'a time rule can name one of the user\'s own clips', String(firstHit.clipId))
      report.check(firstHit.rule?.label === 'A', 'and the answer names the rule that fired')

      // Rule B also matches, but comes second: first match wins.
      await post({ addTimeRule: { clipId: 'builtin:cyberpunk', days: day, start: '00:00', end: '23:59', label: 'B' } })
      const stillA = await resolve('schedule')
      report.check(stillA.clipId === fileClip.id, 'the first matching rule wins, in list order', String(stillA.clipId))

      const active = await resolve('active')
      report.check(active.how === 'schedule', 'mode=active reports how=schedule while a rule is live', String(active.how))

      // A time rule is more specific than "anything", so it must beat random.
      await post({ randomPlayback: true })
      const withRandom = await resolve('active')
      report.check(
        withRandom.how === 'schedule' && withRandom.clipId === fileClip.id,
        'a live time rule outranks random playback',
        `${String(withRandom.how)} / ${String(withRandom.clipId)}`,
      )
      report.check((await resolve('random')).how === 'random', 'mode=random still forces a random pick')
      await post({ randomPlayback: false })

      // The clip rule A names disappears: that rule is stale, so the next live
      // rule must answer instead of the whole resolution coming up empty.
      await post({ selectedClipId: 'builtin:startup' })
      const removed = await h.request('POST', `${BASE}/remove`, { body: { clipId: fileClip.id } })
      report.check(removed.status === 200, 'the file can be removed through the route', removed.text)
      const afterRemoval = await resolve('schedule')
      report.check(
        afterRemoval.clipId === 'builtin:cyberpunk' && afterRemoval.rule?.label === 'B',
        'a rule naming a deleted clip is skipped, and the next live rule answers',
        `${String(afterRemoval.clipId)} / ${String(afterRemoval.rule?.label)}`,
      )

      // Disabling every rule must hand the decision back to the normal chain.
      const rules = (await h.request('GET', `${BASE}/videos.json`)).json().settings.timeRules
      for (const entry of rules) await post({ setTimeRuleEnabled: { id: entry.id, enabled: false } })
      const disabled = await resolve('active')
      report.check(disabled.how === 'selected', 'with every rule off, the stored selection answers again', String(disabled.how))
      report.check(disabled.clipId === 'builtin:startup', 'and it is the clip that was selected')

      const diagnostics = (await h.request('GET', `${BASE}/status.json`)).json().diagnostics.events.map((event) => event.kind)
      report.check(diagnostics.includes('schedule-stale'), 'the stale rule was reported, not swallowed', diagnostics.join(', '))
    }
  } finally {
    await h.close()
  }
}

report.finish()
