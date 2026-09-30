/**
 * verify-route-guard.mjs — the mutating routes must not be usable by a web page.
 *
 * This suite exists because the hole it now closes was REAL and was reproduced
 * against a running DSH before it was written:
 *
 *   curl -X POST -H 'Content-Type: text/plain' -H 'Origin: https://evil.example' \
 *        --data '{"clipId":"intro-1a2b3c4d"}' \
 *        http://127.0.0.1:19387/dsh-boot-animation-pro/remove
 *   -> {"ok":true,"removed":"intro"}          the user's file, deleted
 *
 * The plugin's routes sit OUTSIDE the web token DSH requires for the app shell,
 * so without `route-guard.js` any page the user visits could delete their videos,
 * and DNS rebinding could read the library listing first to learn the ClipIds.
 *
 * The negative cases are therefore the point of this file, and every one of them
 * asserts BOTH the status AND that the file is still on disk — a guard that
 * refuses the request but deletes the file anyway would pass the first half.
 *
 * Usage: node scripts/verify-route-guard.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReport, startHarness } from './lib/harness.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/dsh-boot-animation-pro'
const report = createReport('route guard')

const guard = await import(pathToFileURL(join(ROOT, 'lib', 'host', 'route-guard.js')).href)

console.log('the host parser:')
{
  report.check(guard.hostNameOf('127.0.0.1:19387') === '127.0.0.1', 'a host with a port loses the port')
  report.check(guard.hostNameOf('localhost') === 'localhost', 'a bare hostname survives')
  report.check(guard.hostNameOf('[::1]:3080') === '::1', 'a bracketed IPv6 literal survives its port')
  report.check(guard.hostNameOf('::1') === '::1', 'and one without a port is not cut in half')
  report.check(guard.hostNameOf('') === null, 'an empty host is unusable')

  report.check(guard.isLoopbackHost('127.0.0.1') === true, '127.0.0.1 is loopback')
  report.check(guard.isLoopbackHost('127.13.9.2') === true, 'the whole 127/8 range is loopback')
  report.check(guard.isLoopbackHost('localhost') === true, 'localhost is loopback')
  report.check(guard.isLoopbackHost('evil.example') === false, 'a foreign name is not')
  report.check(guard.isLoopbackHost('127.0.0.1.evil.example') === false, 'nor is a name that merely starts with one')

  report.check(guard.isLoopbackOrigin('http://127.0.0.1:19387') === true, 'a loopback origin passes')
  report.check(guard.isLoopbackOrigin('http://localhost:3080') === true, 'localhost passes')
  report.check(guard.isLoopbackOrigin('https://evil.example') === false, 'a foreign origin does not')
  report.check(guard.isLoopbackOrigin('null') === false, 'Origin: null does not')
  report.check(guard.isLoopbackOrigin('') === false, 'an empty origin does not')
  report.check(guard.isLoopbackOrigin('not a url') === false, 'a malformed origin is not trusted')

  report.check(guard.mediaTypeOf('application/json; charset=utf-8') === 'application/json', 'a media type loses its parameters')
  report.check(guard.mediaTypeOf('TEXT/PLAIN') === 'text/plain', 'and is case-normalised')
}

console.log('\nthe decision table:')
{
  const check = (label, headers, want) => {
    const decision = guard.checkMutation({ headers })
    const ok = want.allowed === decision.allowed && (want.status === undefined || decision.status === want.status)
    report.check(ok, label, `${decision.allowed ? 'allowed' : `refused ${String(decision.status)}: ${decision.reason}`}`)
  }
  check('a plain JSON POST from the app is allowed', { host: '127.0.0.1:19387', 'content-type': 'application/json' }, { allowed: true })
  check(
    'a same-origin browser POST is allowed',
    { host: '127.0.0.1:19387', 'content-type': 'application/json', origin: 'http://127.0.0.1:19387', 'sec-fetch-site': 'same-origin' },
    { allowed: true },
  )
  check(
    'a foreign Origin is refused',
    { host: '127.0.0.1:19387', 'content-type': 'application/json', origin: 'https://evil.example' },
    { allowed: false, status: 403 },
  )
  check(
    'Sec-Fetch-Site: cross-site is refused even without an Origin',
    { host: '127.0.0.1:19387', 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
    { allowed: false, status: 403 },
  )
  check(
    'a foreign Host is refused (DNS rebinding)',
    { host: 'evil.example', 'content-type': 'application/json' },
    { allowed: false, status: 403 },
  )
  check(
    'a form-encoded body is refused (it is the request a preflight cannot stop)',
    { host: '127.0.0.1:19387', 'content-type': 'text/plain' },
    { allowed: false, status: 415 },
  )
  check('a missing content type is refused', { host: '127.0.0.1:19387' }, { allowed: false, status: 415 })
}

console.log('\nagainst the real routes, with a real file to lose:')
{
  const h = await startHarness()
  try {
    const target = h.put('guard-probe.mp4', Buffer.from('do not delete me'))
    const listed = (await h.request('GET', `${BASE}/videos.json`)).json()
    const row = listed.videos.find((entry) => entry.file === 'guard-probe.mp4')
    report.check(row !== undefined, 'the probe file is listed')

    /** One hostile request, asserted on status AND on the file surviving. */
    const attack = async (label, headers, wantStatus) => {
      const response = await h.request('POST', `${BASE}/remove`, { body: { clipId: row.id }, headers })
      report.check(response.status === wantStatus, `${label} -> ${String(wantStatus)}`, `got ${String(response.status)}: ${response.text.slice(0, 120)}`)
      report.check(existsSync(target), `${label}: the file survives`)
    }

    await attack(
      'the reproduced attack (no cookie, text/plain, foreign Origin)',
      { 'content-type': 'text/plain', origin: 'https://evil.example' },
      403,
    )
    await attack('a foreign Origin with a JSON body', { 'content-type': 'application/json', origin: 'https://evil.example' }, 403)
    await attack(
      'a cross-site fetch that lies about its content type',
      { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      403,
    )
    await attack('a rebinding Host', { host: 'attacker.example', 'content-type': 'application/json' }, 403)
    await attack('a preflight-proof form body', { 'content-type': 'application/x-www-form-urlencoded' }, 415)

    report.check(
      String((await h.request('POST', `${BASE}/remove`, { body: {}, headers: { 'content-type': 'text/plain' } })).headers['cache-control'] ?? '').includes('no-store'),
      'a refusal is uncacheable, so it cannot be replayed from a cache later',
    )

    console.log('\nthe same guard protects /select:')
    {
      const before = (await h.request('GET', `${BASE}/videos.json`)).json().settings.overlayTitle
      const refused = await h.request('POST', `${BASE}/select`, { body: { overlayTitle: 'pwned' }, headers: { origin: 'https://evil.example' } })
      report.check(refused.status === 403, 'a foreign-origin write is refused', String(refused.status))
      const after = (await h.request('GET', `${BASE}/videos.json`)).json().settings.overlayTitle
      report.check(after === before, 'and nothing was written')
    }

    console.log('\nthe plugin still works for its actual client:')
    {
      const ok = await h.request('POST', `${BASE}/select`, { body: { overlayTitle: 'legit' } })
      report.check(ok.status === 200 && ok.json().settings.overlayTitle === 'legit', 'a normal write still succeeds')
      const removed = await h.request('POST', `${BASE}/remove`, { body: { clipId: row.id } })
      report.check(removed.status === 200, 'and a normal delete still succeeds', removed.text)
      report.check(!existsSync(target), 'removing the file for real still works')
    }

    report.check(
      readFileSync(join(ROOT, 'src', 'host', 'index.js'), 'utf8').includes('mutationAllowed'),
      'both mutating routes share one guard rather than each rolling its own',
    )
  } finally {
    await h.close()
  }
}

report.finish()
