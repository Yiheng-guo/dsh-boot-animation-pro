/**
 * verify-blank.mjs — run the SHIPPED client bundle and check the "is this a
 * brand-new conversation" reader against every host shape it can meet.
 *
 * Why this file exists: DSH 0.2.0 moved that flag. `hooks.session` became a
 * `SessionFace` (`ISession & ObservableSnapshot<SessionSnapshot>`), so the flag
 * is `getSnapshot().blank`; the old `blankBit` field went private. Reading the
 * field that is no longer there does NOT throw — it answers `undefined` — so the
 * symptom was not a broken build or a console error but silence: "auto-play on a
 * new conversation" stopped firing, and nothing in the repo noticed.
 *
 * So this loads `lib/client.js` through a stub of the host's module loader,
 * grabs the real exported function, and asserts the whole matrix. The legacy
 * shape has to keep working, because the plugin still supports hosts that
 * predate 0.2.0.
 *
 * Usage: node scripts/verify-blank.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')

/** Enough of React for module evaluation; nothing here renders. */
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
    load: ({ id, factory }) => {
      loaded = factory((name) => {
        if (name === 'react' || name === 'react/jsx-runtime') return reactStub
        throw new Error(`unexpected require(${name})`)
      })
      loaded.id = id
    },
  },
}
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, set textContent(v) {} }), head: { appendChild: () => {} }, addEventListener: () => {}, removeEventListener: () => {} }

try {
  // eslint-disable-next-line no-eval
  eval(readFileSync(BUNDLE, 'utf8'))
} catch (error) {
  console.error(`verify-blank: evaluating the bundle threw — ${String(error?.message ?? error)}`)
  process.exit(2)
}

if (loaded === null || typeof loaded.isBlankSession !== 'function') {
  console.error('verify-blank: the bundle did not export isBlankSession — cannot verify')
  process.exit(2)
}
const isBlank = loaded.isBlankSession

const M = (v) => JSON.stringify(v)
const cases = [
  ['0.2.0 face, snapshot blank:true', { getSnapshot: () => ({ blank: true }) }, true],
  ['0.2.0 face, snapshot blank:false', { getSnapshot: () => ({ blank: false }) }, false],
  ['0.2.0 face, blank not true (string)', { getSnapshot: () => ({ blank: 'true' }) }, false],
  ['0.2.0 face, snapshot without the key', { getSnapshot: () => ({}) }, false],
  ['0.2.0 face, getSnapshot returns null', { getSnapshot: () => null }, false],
  ['0.2.0 face, getSnapshot throws', { getSnapshot: () => { throw new Error('boom') } }, false],
  ['pre-0.2.0 binding, blankBit:true', { blankBit: true }, true],
  ['pre-0.2.0 binding, blankBit:false', { blankBit: false }, false],
  ['face without the key falls back to blankBit', { getSnapshot: () => ({}), blankBit: true }, true],
  ['throwing face falls back to blankBit', { getSnapshot: () => { throw new Error('boom') }, blankBit: true }, true],
  ['empty object', {}, false],
  ['undefined', undefined, false],
  ['null', null, false],
]

let failed = 0
console.log(`bundle: ${BUNDLE}`)
for (const [label, input, want] of cases) {
  let got
  try {
    got = isBlank(input)
  } catch (error) {
    got = `threw: ${String(error?.message ?? error)}`
  }
  const ok = got === want
  if (!ok) failed += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(42)} -> ${String(got)} (want ${want})`)
}

console.log('')
if (failed === 0) {
  console.log(`all ${cases.length} shape checks passed`)
  process.exit(0)
}
console.log(`${failed} check(s) failed — the 0.2.0 flag move is not handled`)
process.exit(1)
