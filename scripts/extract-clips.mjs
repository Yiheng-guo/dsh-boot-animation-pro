/**
 * extract-clips.mjs — write `media/*.mp4` back out of the embedded data.
 *
 * WHY THIS EXISTS. `media/` is 8.7 MB of inputs whose only job is to generate
 * `lib/clips.data.js`, and `clips.data.js` is committed. For somebody who just
 * wants the plugin, those 8.7 MB are dead weight — and they are not free: the
 * source archive that `pnpm add github:…` downloads is roughly 19 MB WITH them
 * and roughly 10 MB without. On a slow connection that difference is the line
 * between "installed" and "gave up".
 *
 * So `.gitattributes` marks `media/` as `export-ignore`: git users still clone
 * it, archives omit it. This script makes that exclusion LOSSLESS rather than a
 * one-way door — the bytes are all in `lib/clips.data.js` already, so they can
 * always be put back.
 *
 * It verifies the sha256 of every clip it writes, so a data file that has been
 * edited by hand cannot quietly produce a corrupt video.
 *
 * Usage: node scripts/extract-clips.mjs [--force]
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CLIP_SOURCES } from './lib/clips-manifest.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')

const { CLIPS } = await import(pathToFileURL(join(ROOT, 'lib', 'clips.meta.js')).href)
const data = await import(pathToFileURL(join(ROOT, 'lib', 'clips.data.js')).href)

mkdirSync(join(ROOT, 'media'), { recursive: true })

let wrote = 0
let skipped = 0
for (const source of CLIP_SOURCES) {
  const meta = CLIPS.find((entry) => entry.id === source.id)
  if (meta === undefined) {
    console.error(`extract-clips: lib/clips.meta.js has no clip "${source.id}"`)
    process.exit(1)
  }
  const target = join(ROOT, source.file)
  if (!force && existsSync(target) && statSync(target).size === meta.bytes) {
    console.log(`  skip  ${source.file} (already present, ${String(meta.bytes)} bytes)`)
    skipped += 1
    continue
  }
  const base64 = data[source.id]
  if (typeof base64 !== 'string') {
    console.error(`extract-clips: lib/clips.data.js has no payload for "${source.id}"`)
    process.exit(1)
  }
  const bytes = Buffer.from(base64, 'base64')
  const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  if (bytes.length !== meta.bytes || sha !== meta.sha256) {
    console.error(
      `extract-clips: ${source.id} does not match its metadata — ` +
        `got ${String(bytes.length)} bytes / ${sha}, expected ${String(meta.bytes)} / ${meta.sha256}`,
    )
    process.exit(1)
  }
  writeFileSync(target, bytes)
  console.log(`  ok    ${source.file} (${String(bytes.length)} bytes, sha256 ${sha})`)
  wrote += 1
}

console.log(`\nextract-clips: wrote ${String(wrote)}, skipped ${String(skipped)}`)
