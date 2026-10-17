/**
 * verify-mp4-boxes.mjs — the faststart probe must read box headers, not text.
 *
 * Two things are checked, and they are different in kind:
 *
 *  1. `readTopLevelBoxes` / `faststartFromBoxes` / `probeFaststart` answer
 *     correctly on narrow cases: `moov` first, `moov` last, 64-bit largesize,
 *     size-0 ("to EOF"), truncated heads, zero-byte files, missing files.
 *
 *  2. `legacyHasFaststart` — a verbatim copy of the implementation this change
 *     replaces — gives the WRONG answer on the padding fixture. Asserting the
 *     old behaviour fails is the point of the suite: it turns "the text search
 *     is unsound" into a reproducible failure rather than a claim in a PR
 *     description. If that assertion ever starts passing, the fixture has been
 *     weakened and the suite no longer proves anything.
 *
 * Every fixture is built from box headers in memory, so no media file, decoder
 * or network is involved.
 */
import { closeSync, mkdtempSync, openSync, readSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FASTSTART,
  FASTSTART_HEAD,
  NOT_FASTSTART,
  UNKNOWN,
  canCarryMoov,
  faststartFromBoxes,
  probeFaststart,
  readTopLevelBoxes,
} from '../src/host/mp4-boxes.js'
import { createReport } from './lib/harness.mjs'

const report = createReport('mp4 boxes')

/** A 32-bit sized box. */
function box(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + payload.length, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, payload])
}

/** A box using `size === 1` and a 64-bit largesize. */
function box64(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(16)
  header.writeUInt32BE(1, 0)
  header.write(type, 4, 'latin1')
  const size = 16 + payload.length
  header.writeUInt32BE(Math.floor(size / 2 ** 32), 8)
  header.writeUInt32BE(size >>> 0, 12)
  return Buffer.concat([header, payload])
}

/** A box using `size === 0`, meaning "runs to the end of the file". */
function boxToEof(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(0, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, payload])
}

/** Payload of `bytes` zeros with `needle` planted at `at`. */
function payloadWith(needle, at, bytes) {
  const buffer = Buffer.alloc(bytes)
  buffer.write(needle, at, 'latin1')
  return buffer
}

const ftyp = box('ftyp', Buffer.from('isomiso2isommp41', 'latin1'))
const moovSmall = box('moov', Buffer.from('fake-moov-payload', 'latin1'))

/**
 * The implementation in `clip-registry.js` today, copied verbatim.
 * Kept only to assert that it disagrees with the structural walk.
 */
function legacyHasFaststart(filePath) {
  let fd = null
  try {
    fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(FASTSTART_HEAD)
    const read = readSync(fd, buffer, 0, FASTSTART_HEAD, 0)
    const head = buffer.subarray(0, read).toString('latin1')
    const moov = head.indexOf('moov')
    if (moov === -1) return false
    const mdat = head.indexOf('mdat')
    return mdat === -1 || moov < mdat
  } catch {
    return false
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        /* already closed */
      }
    }
  }
}

/** The mapping `clip-registry.js` needs: only a confirmed answer counts as true. */
const asBoolean = (verdict) => verdict === FASTSTART

const dir = mkdtempSync(join(tmpdir(), 'dba-mp4-'))
function put(name, contents) {
  const path = join(dir, name)
  writeFileSync(path, contents)
  return path
}

try {
  // ---- structural walk -----------------------------------------------------

  {
    const { boxes, truncated } = readTopLevelBoxes(Buffer.concat([ftyp, moovSmall, box('mdat', Buffer.alloc(64))]))
    report.check(
      boxes.map((b) => b.type).join(',') === 'ftyp,moov,mdat',
      'walk: three top-level boxes in file order',
      `got ${boxes.map((b) => b.type).join(',')}`,
    )
    report.check(
      boxes[2].offset === ftyp.length + moovSmall.length,
      'walk: each box offset is the sum of the boxes before it',
      `got ${String(boxes[2].offset)}`,
    )
    report.check(truncated === false, 'walk: a head that ends on a box boundary is not truncated')
  }

  {
    const { boxes } = readTopLevelBoxes(Buffer.concat([ftyp, box64('mdat', Buffer.alloc(32))]))
    report.check(
      boxes[1]?.type === 'mdat' && boxes[1]?.headerSize === 16 && boxes[1]?.size === 48,
      'walk: size===1 reads the 64-bit largesize and counts a 16-byte header',
      JSON.stringify(boxes[1]),
    )
  }

  {
    const { boxes, truncated } = readTopLevelBoxes(Buffer.concat([ftyp, boxToEof('mdat', Buffer.alloc(40))]))
    report.check(
      boxes[1]?.type === 'mdat' && truncated === false,
      'walk: size===0 is recorded and consumes the rest of the window',
      JSON.stringify({ boxes: boxes.map((b) => b.type), truncated }),
    )
  }

  {
    const short = Buffer.concat([ftyp, Buffer.from([0, 0, 0, 40, 0x6d, 0x6f])])
    const { boxes, truncated } = readTopLevelBoxes(short)
    report.check(
      truncated === true && boxes.length === 1,
      'walk: a head ending mid-header stops without inventing a box',
      JSON.stringify({ boxes: boxes.map((b) => b.type), truncated }),
    )
  }

  {
    const bad = Buffer.concat([ftyp, Buffer.from([0, 0, 0, 3, 0x6d, 0x64, 0x61, 0x74])])
    const { boxes, truncated } = readTopLevelBoxes(bad)
    report.check(
      truncated === true && boxes.length === 1,
      'walk: size smaller than the header is malformed, not a box',
      JSON.stringify({ boxes: boxes.map((b) => b.type), truncated }),
    )
  }

  {
    const planted = box('mdat', payloadWith('moov', 4, 64))
    const { boxes } = readTopLevelBoxes(Buffer.concat([ftyp, planted]))
    report.check(
      boxes.map((b) => b.type).join(',') === 'ftyp,mdat',
      'walk: the bytes "moov" inside an mdat payload do not become a box',
      `got ${boxes.map((b) => b.type).join(',')}`,
    )
  }

  // ---- decision ------------------------------------------------------------

  {
    const fast = Buffer.concat([ftyp, moovSmall, box('mdat', Buffer.alloc(64))])
    const slow = Buffer.concat([ftyp, box('mdat', Buffer.alloc(64)), moovSmall])
    report.check(faststartFromBoxes(readTopLevelBoxes(fast).boxes) === FASTSTART, 'decide: moov before mdat')
    report.check(faststartFromBoxes(readTopLevelBoxes(slow).boxes) === NOT_FASTSTART, 'decide: mdat before moov')
    report.check(
      faststartFromBoxes(readTopLevelBoxes(Buffer.concat([ftyp, box('moof', Buffer.alloc(16))])).boxes) === UNKNOWN,
      'decide: a fragmented file is UNKNOWN, not a guess',
    )
    report.check(
      faststartFromBoxes(readTopLevelBoxes(ftyp).boxes) === UNKNOWN,
      'decide: a head with neither box is UNKNOWN, not "not faststart"',
    )
  }

  // ---- the probe on files --------------------------------------------------

  {
    const fastPath = put('faststart.mp4', Buffer.concat([ftyp, moovSmall, box('mdat', Buffer.alloc(256))]))
    report.check(probeFaststart(fastPath) === FASTSTART, 'probe: faststart file reports FASTSTART')
  }

  {
    const slowPath = put(
      'moov-at-end.mp4',
      Buffer.concat([ftyp, box('mdat', Buffer.alloc(200_000)), moovSmall]),
    )
    report.check(probeFaststart(slowPath) === NOT_FASTSTART, 'probe: moov past the window reports NOT_FASTSTART')
  }

  {
    // The regression fixture. A `free` box larger than the 64KB window pushes
    // `mdat` out of it, and the padding payload spells "moov". The text search
    // sees `moov` and no `mdat`, so it reports faststart for a file that will
    // show nothing until the whole thing is fetched.
    const padding = payloadWith('moov', 20_000, 100_000)
    const path = put(
      'padding-then-mdat.mp4',
      Buffer.concat([ftyp, box('free', padding), box('mdat', Buffer.alloc(1024)), moovSmall]),
    )
    const probe = probeFaststart(path)
    report.check(
      probe === UNKNOWN,
      'probe: padding past the window is UNKNOWN, not a faststart claim',
      `got ${probe}`,
    )
    report.check(
      asBoolean(probe) === false,
      'probe: UNKNOWN degrades to false at the call site',
      `got ${String(asBoolean(probe))}`,
    )
    report.check(
      legacyHasFaststart(path) === true,
      'legacy: the text search really does report faststart here (bug reproduced)',
      'the fixture stopped reproducing the defect; regenerate it before trusting this suite',
    )
  }

  {
    const path = put('quicktime.mov', Buffer.concat([ftyp, moovSmall, box('mdat', Buffer.alloc(128))]))
    report.check(canCarryMoov('.mov') === true, 'ext: .mov can carry moov and is now probed')
    report.check(probeFaststart(path) === FASTSTART, 'probe: a faststart .mov is recognised')
    report.check(canCarryMoov('.webm') === false, 'ext: .webm cannot carry moov and is not probed')
    report.check(canCarryMoov('.mkv') === false, 'ext: .mkv cannot carry moov and is not probed')
  }

  {
    const empty = put('empty.mp4', Buffer.alloc(0))
    report.check(probeFaststart(empty) === UNKNOWN, 'probe: a zero-byte file is UNKNOWN and does not throw')
  }

  {
    report.check(
      probeFaststart(join(dir, 'does-not-exist.mp4')) === UNKNOWN,
      'probe: a missing file is UNKNOWN and does not throw',
    )
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

report.finish()
