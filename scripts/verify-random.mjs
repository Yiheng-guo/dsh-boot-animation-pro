/**
 * verify-random.mjs — the "do not repeat the last clip" rule, 1000 times over.
 *
 * The requirement is exact: when random playback is on, pick from all playable
 * clips, and never pick the same clip twice in a row unless it is the only one.
 * The algorithm is a pure function so it can be driven 1000 times deterministically
 * here, and the HTTP route is checked separately to prove the route really uses
 * that controller rather than a second implementation.
 *
 * Usage: node scripts/verify-random.mjs
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const report = createReport('random')

const { pickRandom, RandomController } = await import(
  pathToFileURL(join(ROOT, 'lib', 'host', 'random-controller.js')).href
)

const clips = [{ id: 'builtin:brand' }, { id: 'builtin:cyberpunk' }, { id: 'builtin:awakening' }, { id: 'builtin:startup' }]

console.log('pickRandom() — pure:')
{
  report.check(pickRandom([], null, () => 0.5) === null, 'an empty pool returns null')
  const single = pickRandom([{ id: 'only' }], 'only', () => 0.5)
  report.check(single !== null && single.id === 'only', 'the only clip is returned even though it was last')
  // rng that returns exactly 1 must not index past the end.
  const clamped = pickRandom(clips, null, () => 1)
  report.check(clamped !== null && clamped.id === 'builtin:startup', 'rng()==1 clamps to the last candidate')
  const zero = pickRandom(clips, null, () => 0)
  report.check(zero !== null && zero.id === 'builtin:brand', 'rng()==0 selects the first candidate')
}

console.log('\n1000 picks through the real controller:')
{
  // A deterministic source with a poor distribution on purpose: the no-repeat
  // rule must hold even when the random source keeps pointing at one clip.
  let seed = 123456789
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const controller = new RandomController({ rng })
  const picks = []
  for (let i = 0; i < 1000; i += 1) picks.push(controller.pick(clips)?.id)

  report.check(picks.every((id) => typeof id === 'string'), 'every pick returned a clip')
  const repeats = picks.filter((id, index) => index > 0 && id === picks[index - 1])
  report.check(repeats.length === 0, `no two consecutive picks are the same (${String(repeats.length)} repeats in 1000)`)
  const distinct = new Set(picks)
  report.check(distinct.size === clips.length, `all ${String(clips.length)} clips were reachable (saw ${String(distinct.size)})`)
  report.check(picks.length === 1000, 'the run was 1000 picks long')
}
{
  // The pathological source: always the same random value. The controller must
  // still avoid a repeat, because it filters the last pick out first.
  const controller = new RandomController({ rng: () => 0.5 })
  const picks = []
  for (let i = 0; i < 100; i += 1) picks.push(controller.pick(clips)?.id)
  const repeats = picks.filter((id, index) => index > 0 && id === picks[index - 1])
  report.check(repeats.length === 0, 'a constant rng still never repeats consecutively')
}
{
  const controller = new RandomController({ rng: () => 0.5 })
  const single = [{ id: 'only' }]
  const ids = []
  for (let i = 0; i < 10; i += 1) ids.push(controller.pick(single)?.id)
  report.check(ids.every((id) => id === 'only'), 'a single playable clip is returned every time')
}

console.log('\nover the real routes:')
{
  const h = await startHarness()
  try {
    const off = (await h.request('GET', '/dsh-boot-animation-pro/resolve.json')).json()
    report.check(off.how !== 'random', 'with random playback off, resolve does not pick randomly')

    await h.request('POST', '/dsh-boot-animation-pro/select', { body: { randomPlayback: true } })
    const on = (await h.request('GET', '/dsh-boot-animation-pro/resolve.json?mode=active')).json()
    report.check(on.how === 'random', `mode=active honours the random setting (how=${String(on.how)})`)

    const seen = []
    for (let i = 0; i < 60; i += 1) {
      const body = (await h.request('GET', '/dsh-boot-animation-pro/resolve.json?mode=active')).json()
      seen.push(body.clipId)
    }
    const repeats = seen.filter((id, index) => index > 0 && id === seen[index - 1])
    report.check(repeats.length === 0, `60 resolve calls never repeat consecutively (${String(repeats.length)} repeats)`)
    report.check(new Set(seen).size === 4, `all four built-ins are reachable through the route (saw ${String(new Set(seen).size)})`)

    const forced = []
    for (let i = 0; i < 30; i += 1) {
      forced.push((await h.request('GET', '/dsh-boot-animation-pro/resolve.json?mode=random')).json().clipId)
    }
    const forcedRepeats = forced.filter((id, index) => index > 0 && id === forced[index - 1])
    report.check(forcedRepeats.length === 0, 'mode=random also never repeats consecutively')

    // Random must still produce a URL that names the clip it picked.
    const one = (await h.request('GET', '/dsh-boot-animation-pro/resolve.json?mode=random')).json()
    report.check(
      typeof one.mediaUrl === 'string' && one.mediaUrl.endsWith(encodeURIComponent(one.clipId)),
      'the resolved clip and its media URL agree',
      `${String(one.clipId)} vs ${String(one.mediaUrl)}`,
    )
    const bytes = await h.request('GET', one.mediaUrl)
    report.check(bytes.status === 200 && bytes.body.length > 0, 'the resolved media URL serves real bytes')
  } finally {
    await h.close()
  }
}

report.finish()
