/**
 * verify-session-id.mjs — exercise the shipped current-session identity resolver.
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


if (loaded === null || typeof loaded.resolveSessionId !== 'function') {
  console.error('verify-session-id: bundle did not export resolveSessionId')
  process.exit(2)
}

const cases = [
  [
    'session snapshot wins on the newest shape',
    {
      key: 'binding-key',
      hooks: { session: { getSnapshot: () => ({ sessionId: 'snapshot-id' }) } },
      props: { sessionId: 'legacy-id' },
    },
    'snapshot-id',
  ],
  [
    'binding.key is the ui-session adapter fallback',
    { key: 'binding-key', hooks: { session: { getSnapshot: () => ({}) } } },
    'binding-key',
  ],
  [
    'legacy props.sessionId remains supported',
    { hooks: { session: { getSnapshot: () => ({}) } }, props: { sessionId: 'legacy-id' } },
    'legacy-id',
  ],
  [
    'throwing session snapshot falls through to binding.key',
    { key: 'binding-key', hooks: { session: { getSnapshot: () => { throw new Error('boom') } } } },
    'binding-key',
  ],
  ['missing identity resolves to null', { hooks: { session: { getSnapshot: () => ({}) } } }, null],
]

let failed = 0
console.log(`bundle: ${BUNDLE}\n`)
for (const [label, input, want] of cases) {
  let got
  try {
    got = loaded.resolveSessionId(input)
  } catch (error) {
    got = `threw: ${String(error?.message ?? error)}`
  }
  const ok = got === want
  if (!ok) failed += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} -> ${String(got)} (want ${String(want)})`)
}

if (failed === 0) {
  console.log('\nall session-id checks passed')
  process.exit(0)
}
console.log(`\n${failed} session-id check(s) failed`)
process.exit(1)
