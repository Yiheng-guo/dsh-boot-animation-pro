/**
 * verify-build.mjs — prove `lib/` is exactly what `src/` produces.
 *
 * The failure this guards against is not exotic: a client bundle that silently
 * failed to rebuild (a template-literal parse error once did exactly that) leaves
 * a stale `lib/client.js` that still loads, so the plugin runs last week's code
 * while the source says otherwise. Byte-comparing the copied host half and
 * mtime-checking the bundled client half makes that state impossible to miss.
 *
 * Usage: node scripts/verify-build.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_HOST = join(ROOT, 'src', 'host')
const SRC_CLIENT = join(ROOT, 'src', 'client')
const LIB = join(ROOT, 'lib')
const LIB_HOST = join(LIB, 'host')

const failures = []
const checks = []
function check(ok, label, detail = '') {
  checks.push({ ok, label, detail })
  if (!ok) failures.push(label)
}

const rel = (p) => relative(ROOT, p).replace(/\\/g, '/')

// 1. Every host source has an identical copy in lib.
const sources = readdirSync(SRC_HOST).filter((n) => n.endsWith('.js'))
check(sources.length > 0, 'src/host has modules', `${String(sources.length)} module(s)`)
for (const name of sources) {
  let identical = false
  let detail = ''
  try {
    const a = readFileSync(join(SRC_HOST, name))
    const b = readFileSync(join(LIB_HOST, name))
    identical = a.equals(b)
    if (!identical) detail = `src ${String(a.length)}B vs lib ${String(b.length)}B`
  } catch (error) {
    detail = String(error?.message ?? error)
  }
  check(identical, `${rel(join(LIB_HOST, name))} is identical to its source`, detail)
}

// 2. lib/index.js is the generated re-export shim, pointing at the real entry.
{
  const text = readFileSync(join(LIB, 'index.js'), 'utf8')
  check(
    /export\s*\{\s*apply,\s*name,\s*inject\s*\}\s*from\s*'\.\/host\/index\.js'/.test(text),
    'lib/index.js re-exports apply/name/inject from ./host/index.js',
  )
  check(
    !/from\s*'\.\/clip-id\.js'/.test(text),
    'lib/index.js does not import host modules as if they were siblings',
  )
}

// 3. No orphan module in lib/host.
const orphans = readdirSync(LIB_HOST).filter((n) => n.endsWith('.js') && !sources.includes(n))
check(orphans.length === 0, 'lib/host has no module without a source', orphans.join(', '))

// 4. The client bundle is newer than every source file it was built from.
function newestMtime(dir) {
  let newest = 0
  let newestFile = ''
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const inner = newestMtime(full)
      if (inner.mtime > newest) {
        newest = inner.mtime
        newestFile = inner.file
      }
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    const mtime = statSync(full).mtimeMs
    if (mtime > newest) {
      newest = mtime
      newestFile = rel(full)
    }
  }
  return { mtime: newest, file: newestFile }
}
{
  const newestSource = newestMtime(SRC_CLIENT)
  const bundle = join(LIB, 'client.js')
  const bundleMtime = statSync(bundle).mtimeMs
  check(
    bundleMtime >= newestSource.mtime,
    'lib/client.js is not older than its newest source',
    `newest source ${newestSource.file} @ ${new Date(newestSource.mtime).toISOString()}, bundle @ ${new Date(bundleMtime).toISOString()}`,
  )
}

// 5. The bundle is a real client module: it must export apply and no static inject.
{
  const text = readFileSync(join(LIB, 'client.js'), 'utf8')
  check(text.includes('__ModuleLoader__'), 'lib/client.js carries the module-loader banner')
  check(/exports\.apply\s*=/.test(text) || /apply\s*:/.test(text), 'lib/client.js exports apply')
  check(!/exports\.inject\s*=/.test(text), 'lib/client.js declares no static inject')
}

// 6. The embedded clips and their metadata agree.
{
  const meta = readFileSync(join(LIB, 'clips.meta.js'), 'utf8')
  const data = readFileSync(join(LIB, 'clips.data.js'), 'utf8')
  // The generator writes JSON-style double quotes; accept either, because the
  // one thing that must not happen is this checker silently matching nothing and
  // calling that a pass.
  const ids = [...meta.matchAll(/["']?id["']?\s*:\s*["']([^"']+)["']/g)].map((m) => m[1])
  check(ids.length > 0, 'clips.meta.js declares at least one clip', `${String(ids.length)} clip(s)`)
  const missing = ids.filter((id) => !new RegExp(`export\\s+const\\s+${id}\\s*=`).test(data))
  check(missing.length === 0, 'every declared clip has embedded bytes', missing.join(', '))
}

console.log('build ↔ source consistency:')
for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.ok || c.detail === '' ? '' : `\n         ${c.detail}`}`)
console.log('')
if (failures.length === 0) {
  console.log(`all ${String(checks.length)} build checks passed`)
  process.exit(0)
}
console.log(`${String(failures.length)} check(s) failed — lib/ is not what src/ produces`)
process.exit(1)
