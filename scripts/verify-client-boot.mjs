/**
 * verify-client-boot.mjs — the plugin must not be able to hang the web boot.
 *
 * Why: the client loader treats ANY entry that is not `active` as fatal —
 * `web boot: N entry did not activate` — and then the whole GUI fails to load.
 * A static `inject` is what holds a fiber in `pending` when the host cannot
 * provide a service, and that is exactly how this plugin once took a user's
 * harness down:
 *
 *   dsh-boot-animation-pro: pending (waiting for service: uisession)
 *
 * The fix is that the bundle exports NO static `inject` at all and resolves both
 * services dynamically. This file asserts that invariant directly (`inject` must
 * be absent — that is the list the boot check walks), and then that `apply()`
 * behaves correctly in all four service situations, so a regression cannot come
 * back as "it built fine".
 *
 * Usage: node scripts/verify-client-boot.mjs
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
}
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, textContent: '' }),
  head: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
}
// The prefetch runs on mount; keep it offline and harmless.
globalThis.fetch = async () => ({ ok: true, json: async () => ({ activeVersion: 'test-version' }) })

try {
  // eslint-disable-next-line no-eval
  eval(readFileSync(BUNDLE, 'utf8'))
} catch (error) {
  console.error(`verify-client-boot: evaluating the bundle threw — ${String(error?.message ?? error)}`)
  process.exit(2)
}

const failures = []
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

console.log(`bundle: ${BUNDLE}\n`)

console.log('static surface:')
check(loaded !== null && typeof loaded.apply === 'function', 'exports apply()')
// THE invariant. `inject` is the exact field the boot check enumerates to decide
// an entry is stuck; its absence is what makes pending impossible.
check(
  loaded.inject === undefined,
  'exports no static `inject` (the field the boot check walks — absent means it cannot be pending)',
)

/** A ctx whose slots service records registrations. */
function makeCtx({ withDynamicInject = true, provideServices = true } = {}) {
  const registrations = []
  const slots = {
    inject: (_name, callback) => {
      if (typeof callback === 'function') callback()
      return () => {}
    },
    register: (options) => {
      registrations.push(options.name)
      return () => {}
    },
  }
  const ctx = {
    slots,
    uiSession: provideServices ? { adapter: { current: undefined } } : undefined,
    effect: (callback) => callback(),
  }
  if (withDynamicInject) {
    // Mirrors cordis: the callback runs only once the deps exist. `provideServices`
    // models a host that never provides them — the callback simply never runs.
    ctx.inject = (_deps, callback) => {
      if (provideServices) callback(ctx)
      return { dispose: () => {} }
    }
  }
  return { ctx, registrations }
}

console.log('\nbehaviour:')
{
  // The field report: services never arrive. Must not throw, must not mount,
  // and — because there is no static inject — must not hold the entry pending.
  const { ctx, registrations } = makeCtx({ provideServices: false })
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, `apply() with services absent does not throw${threw === null ? '' : ` (threw: ${threw})`}`)
  check(registrations.length === 0, 'apply() with services absent mounts nothing')
}
{
  const { ctx, registrations } = makeCtx({ provideServices: true })
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, `apply() with services present does not throw${threw === null ? '' : ` (threw: ${threw})`}`)
  check(
    registrations.length === 2,
    `mounts both seats (got ${registrations.length}: ${registrations.join(', ') || 'none'})`,
  )
  check(registrations.includes('shell.overlay'), 'registers shell.overlay')
  check(registrations.includes('sidebar.footer.action'), 'registers sidebar.footer.action')
}
{
  // Pre-dynamic-injection host, service missing: idle, not pending.
  const { ctx, registrations } = makeCtx({ withDynamicInject: false, provideServices: false })
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, 'apply() without dynamic injection and without uiSession stays idle without throwing')
  check(registrations.length === 0, 'idle path mounts nothing')
}
{
  // Pre-dynamic-injection host, service present: mount directly.
  const { ctx, registrations } = makeCtx({ withDynamicInject: false, provideServices: true })
  let threw = null
  try {
    loaded.apply(ctx)
  } catch (error) {
    threw = String(error?.message ?? error)
  }
  check(threw === null, 'apply() without dynamic injection but with uiSession does not throw')
  check(registrations.length === 2, `falls back to a direct mount (got ${registrations.length})`)
}

console.log('')
if (failures.length === 0) {
  console.log('all client-boot checks passed')
  process.exit(0)
}
console.log(`${failures.length} check(s) failed:`)
for (const f of failures) console.log('  - ' + f)
process.exit(1)
