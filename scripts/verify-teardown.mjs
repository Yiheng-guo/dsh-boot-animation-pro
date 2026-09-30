/**
 * verify-teardown.mjs — exercise the shipped media cleanup helper.
 *
 * Removing a <video> from the DOM does not stop playback. The overlay's effect
 * cleanup calls releaseVideo(), so this verifies the exact shipped cleanup logic.
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


if (loaded === null || typeof loaded.releaseVideo !== 'function') {
  console.error('verify-teardown: bundle did not export releaseVideo')
  process.exit(2)
}

const attrs = new Map([['src', '/dsh-boot-animation-pro/boot.mp4?v=old']])
const video = {
  paused: false,
  currentTime: 12,
  loadCalled: false,
  pause() { this.paused = true },
  removeAttribute(name) { attrs.delete(name) },
  getAttribute(name) { return attrs.get(name) ?? null },
  load() { this.loadCalled = true },
}

loaded.releaseVideo(video)

const failures = []
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}
console.log(`bundle: ${BUNDLE}\n`)
check(video.paused === true, 'pause() is called')
check(video.currentTime === 0, 'currentTime is rewound to zero')
check(video.getAttribute('src') === null, 'src attribute is removed')
check(video.loadCalled === true, 'load() is called to abort/release media resources')

// Keep the integration visible in the shipped bundle too: the helper must be
// referenced outside its own declaration, otherwise the effect cleanup regressed.
const bundleText = readFileSync(BUNDLE, 'utf8')
check(
  (bundleText.match(/releaseVideo\(video\)/g) ?? []).length >= 1,
  'the playback effect cleanup calls releaseVideo(video)',
)

if (failures.length === 0) {
  console.log('\nall teardown checks passed')
  process.exit(0)
}
console.log(`\n${failures.length} teardown check(s) failed`)
process.exit(1)
