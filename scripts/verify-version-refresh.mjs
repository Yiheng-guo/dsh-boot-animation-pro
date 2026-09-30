/**
 * verify-version-refresh.mjs — a selection change must never reuse the previous clip's content.
 *
 * ADAPTED for the 0.3.0 architecture (@windyduan's original test targeted 0.2.x).
 *
 * The original asserted the 0.2.x single-URL scheme: one shared `/boot.mp4` whose
 * `?v=` key was pinned once per page, plus `refreshActiveVersion()` to drop it.
 * 0.3.0 removed that scheme instead of patching it — every clip is now addressed
 * as its own resource, `/media/<ClipId>?v=<that clip's own version>`, which is
 * what makes "select A, then B, then C" deterministic without a reload.
 *
 * The intent is preserved exactly (the next preview must not serve the previous
 * clip's bytes); only the mechanism the assertions read changed. `refreshActiveVersion`
 * no longer exists because there is no shared key left to refresh.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')

const reactStub = {
  createElement: () => null,
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load: ({ factory }) => {
      loaded = factory((name) => {
        if (name === 'react' || name === 'react/jsx-runtime') return reactStub
        throw new Error(`unexpected require(${name})`)
      })
    },
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  clearTimeout: () => {},
  setTimeout: () => 0,
}
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, textContent: '' }),
  head: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
}

try {
  // eslint-disable-next-line no-eval
  eval(readFileSync(BUNDLE, 'utf8'))
} catch (error) {
  console.error(`evaluating the bundle threw — ${String(error?.message ?? error)}`)
  process.exit(2)
}

if (loaded === null || typeof loaded.mediaUrlFor !== 'function') {
  console.error('verify-version-refresh: bundle did not export mediaUrlFor')
  process.exit(2)
}

const failures = []
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}
console.log(`bundle: ${BUNDLE}\n`)

const alphaV1 = loaded.mediaUrlFor({ id: 'alpha', version: 'v1' })
const alphaV2 = loaded.mediaUrlFor({ id: 'alpha', version: 'v2' })
const betaV1 = loaded.mediaUrlFor({ id: 'beta', version: 'v1' })
const alphaNoVersion = loaded.mediaUrlFor({ id: 'alpha', version: null })

check(alphaV1 !== betaV1, 'two clips are two distinct resources — the next clip cannot hit the previous cache entry')
check(alphaV1 !== alphaV2, 'a new content version yields a new URL — edited bytes are never reused')
check(!betaV1.includes('alpha'), 'the next clip URL cannot address the previous clip at all')
check(alphaV1.includes('/media/alpha'), 'the URL names exactly one clip')
check(alphaV1.endsWith('?v=v1'), "the clip's own content key is pinned")
check(!alphaNoVersion.includes('?v='), 'an unstamped clip falls back to the bare clip URL')
check(alphaV1 === loaded.mediaUrlFor({ id: 'alpha', version: 'v1' }), 'the same clip and key resolve to the same URL')

// Keep the integration visible in the shipped bundle: per-clip addressing must
// actually be in the artifact, not only in this test's idea of it.
const bundleText = readFileSync(BUNDLE, 'utf8')
check(bundleText.includes('/media/'), 'the shipped bundle addresses clips by id')

if (failures.length === 0) {
  console.log('\nall version-refresh checks passed')
  process.exit(0)
}
console.log(`\n${failures.length} version-refresh check(s) failed`)
process.exit(1)
