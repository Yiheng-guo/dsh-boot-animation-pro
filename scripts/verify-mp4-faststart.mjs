/**
 * verify-mp4-faststart.mjs — the remux rewrites offsets correctly, or refuses.
 *
 * The assertions are read back with a parser written HERE, not imported from the
 * module under test: a suite that decodes its own output with the same walker
 * that encoded it proves nothing about either.
 *
 * Every fixture is synthesized from box headers, so no media file, codec or
 * network is involved. The fixtures are also the interesting part — they encode
 * the layouts that make a single global offset delta wrong.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALREADY_FASTSTART, REMUXED, patchChunkOffsets, remuxFaststart, scanTopLevel } from '../src/host/mp4-faststart.js'
import { createReport } from './lib/harness.mjs'

const report = createReport('mp4 faststart remux')

// ---- fixture builders ------------------------------------------------------

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

const container = (type, ...children) => box(type, Buffer.concat(children))

function chunkTable(type, entries) {
  const width = type === 'stco' ? 4 : 8
  const payload = Buffer.alloc(8 + entries.length * width)
  payload.writeUInt32BE(0, 0) // version + flags
  payload.writeUInt32BE(entries.length, 4)
  entries.forEach((value, index) => {
    if (type === 'stco') payload.writeUInt32BE(value, 8 + index * width)
    else payload.writeBigUInt64BE(BigInt(value), 8 + index * width)
  })
  return box(type, payload)
}

/** `moov > trak > mdia > minf > stbl > <table>`, one track. */
function moovWith(tableType, offsets) {
  return container(
    'moov',
    box('mvhd', Buffer.alloc(96)),
    container('trak', container('mdia', container('minf', container('stbl', chunkTable(tableType, offsets))))),
  )
}

const ftyp = box('ftyp', Buffer.from('isomiso2isommp41', 'latin1'))

/** Deterministic payload, so a moved block can be compared byte for byte. */
function payload(bytes) {
  const buffer = Buffer.alloc(bytes)
  for (let index = 0; index < bytes; index += 1) buffer[index] = (index * 7 + 3) & 0xff
  return buffer
}

/**
 * `ftyp, mdat, moov` — the layout this transform exists for.
 * Offsets point into the mdat payload, which starts after the mdat header.
 */
function buildSlowFile({ tableType = 'stco', bodyBytes = 1024 } = {}) {
  const body = payload(bodyBytes)
  const mdat = box('mdat', body)
  const payloadStart = ftyp.length + mdat.length - bodyBytes
  const offsets = [payloadStart, payloadStart + 16, payloadStart + 32]
  const moov = moovWith(tableType, offsets)
  return { bytes: Buffer.concat([ftyp, mdat, moov]), offsets, body, payloadStart }
}

// ---- independent reader ----------------------------------------------------

function topLevel(buffer) {
  const boxes = []
  let offset = 0
  while (offset + 8 <= buffer.length) {
    const size32 = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    let size = size32
    if (size32 === 1) {
      if (offset + 16 > buffer.length) break
      size = buffer.readUInt32BE(offset + 8) * 2 ** 32 + buffer.readUInt32BE(offset + 12)
    } else if (size32 === 0) {
      size = buffer.length - offset
    }
    if (size < 8 || offset + size > buffer.length) break
    boxes.push({ type, start: offset, size, end: offset + size })
    offset += size
  }
  return boxes
}

const NESTED = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])

/** Every chunk table in the file, read with a walker that lives in this file. */
function chunkTables(buffer) {
  const found = []
  const walk = (start, end) => {
    let offset = start
    while (offset + 8 <= end) {
      const size = buffer.readUInt32BE(offset)
      const type = buffer.toString('latin1', offset + 4, offset + 8)
      if (size < 8 || offset + size > end) return
      if (type === 'stco' || type === 'co64') {
        const width = type === 'stco' ? 4 : 8
        const count = buffer.readUInt32BE(offset + 12)
        const entries = []
        for (let index = 0; index < count; index += 1) {
          const at = offset + 16 + index * width
          entries.push(type === 'stco' ? buffer.readUInt32BE(at) : Number(buffer.readBigUInt64BE(at)))
        }
        found.push({ type, entries })
      }
      if (NESTED.has(type)) walk(offset + 8, offset + size)
      offset += size
    }
  }
  const moov = topLevel(buffer).find((b) => b.type === 'moov')
  if (moov) walk(moov.start + 8, moov.end)
  return found
}

/** Run a remux that is expected to fail, returning the error for inspection. */
function expectFailure(sourcePath, destPath) {
  try {
    remuxFaststart(sourcePath, destPath)
    return null
  } catch (error) {
    return error
  }
}

const dir = mkdtempSync(join(tmpdir(), 'dba-remux-'))
let counter = 0
function put(bytes) {
  counter += 1
  const path = join(dir, `fixture-${String(counter)}.mp4`)
  writeFileSync(path, bytes)
  return path
}
const outPath = (suffix) => join(dir, `out-${String(++counter)}${suffix ?? '.mp4'}`)

try {
  // ---- the normal transform ------------------------------------------------

  {
    const fixture = buildSlowFile()
    const source = put(fixture.bytes)
    const dest = outPath()
    const result = remuxFaststart(source, dest)

    report.check(result.status === REMUXED, 'remux: a moov-at-end file is rewritten', JSON.stringify(result))
    report.check(result.chunks === fixture.offsets.length, 'remux: every chunk offset is rewritten', String(result.chunks))

    const after = readFileSync(dest)
    const boxes = topLevel(after)
    const order = boxes.map((b) => b.type).join(',')
    report.check(order === 'ftyp,moov,mdat', 'layout: moov now precedes mdat', `got ${order}`)
    report.check(after.length === fixture.bytes.length, 'size: the file only reordered, byte count unchanged')

    const moov = boxes.find((b) => b.type === 'moov')
    const expected = fixture.offsets.map((value) => value + moov.size)
    const table = chunkTables(after)[0]
    report.check(
      table !== undefined && JSON.stringify(table.entries) === JSON.stringify(expected),
      'offsets: each chunk moved forward by exactly the moov size',
      `got ${JSON.stringify(table?.entries)} want ${JSON.stringify(expected)}`,
    )

    const mdat = boxes.find((b) => b.type === 'mdat')
    const movedBody = after.subarray(mdat.start + 8, mdat.end)
    report.check(
      movedBody.equals(fixture.body),
      'payload: the media bytes are identical, not re-encoded',
    )

    report.check(
      readFileSync(source).equals(fixture.bytes),
      'source: the input file is untouched',
    )
  }

  // ---- co64 ----------------------------------------------------------------

  {
    const fixture = buildSlowFile({ tableType: 'co64' })
    const source = put(fixture.bytes)
    const dest = outPath()
    remuxFaststart(source, dest)
    const after = readFileSync(dest)
    const moov = topLevel(after).find((b) => b.type === 'moov')
    const table = chunkTables(after)[0]
    const expected = fixture.offsets.map((value) => value + moov.size)
    report.check(table?.type === 'co64', 'co64: the 64-bit table is recognised')
    report.check(
      JSON.stringify(table?.entries) === JSON.stringify(expected),
      'co64: entries shift by the moov size too',
      `got ${JSON.stringify(table?.entries)} want ${JSON.stringify(expected)}`,
    )
  }

  // ---- no-op ---------------------------------------------------------------

  {
    const body = payload(256)
    const mdat = box('mdat', body)
    const moov = moovWith('stco', [ftyp.length + 8, ftyp.length + 24])
    const source = put(Buffer.concat([ftyp, moov, mdat]))
    const dest = outPath()
    const result = remuxFaststart(source, dest)
    report.check(result.status === ALREADY_FASTSTART, 'no-op: an already-faststart file reports so')
    report.check(!existsSync(dest), 'no-op: no output file is written')
  }

  // ---- the layout that breaks a single global delta ------------------------

  {
    // ftyp, mdat, moov, mdat: the first mdat is pushed back by the insertion,
    // the second is pushed back by the insertion and pulled forward by the
    // removal, so its chunks must NOT move at all.
    const firstBody = payload(512)
    const secondBody = payload(256)
    const mdatA = box('mdat', firstBody)
    const mdatB = box('mdat', secondBody)
    const secondStart = ftyp.length + mdatA.length + 0 // filled in after moov is built
    const offsets = [ftyp.length + 8, 0]
    // Build once to learn the moov size, then rebuild with the real second offset.
    const probeMoov = moovWith('stco', [ftyp.length + 8, ftyp.length + mdatA.length + 1000])
    const moov = moovWith('stco', [ftyp.length + 8, ftyp.length + mdatA.length + probeMoov.length + 8])
    const bytes = Buffer.concat([ftyp, mdatA, moov, mdatB])
    const source = put(bytes)
    const dest = outPath()
    remuxFaststart(source, dest)

    const after = readFileSync(dest)
    const boxes = topLevel(after)
    report.check(
      boxes.map((b) => b.type).join(',') === 'ftyp,moov,mdat,mdat',
      'middle moov: it moves to the front, both mdats keep their order',
      `got ${boxes.map((b) => b.type).join(',')}`,
    )
    const table = chunkTables(after)[0]
    const movedMoov = boxes.find((b) => b.type === 'moov')
    report.check(
      table.entries[0] === ftyp.length + 8 + movedMoov.size,
      'middle moov: a chunk in the mdat before moov is shifted forward',
      `got ${String(table.entries[0])}`,
    )
    report.check(
      table.entries[1] === ftyp.length + mdatA.length + moov.length + 8,
      'middle moov: a chunk in the mdat after moov is NOT shifted (this is why one delta is wrong)',
      `got ${String(table.entries[1])} want ${String(ftyp.length + mdatA.length + moov.length + 8)}`,
    )
  }

  // ---- refusals ------------------------------------------------------------

  {
    const bits = { fragmented: null, 'no-mdat': null, 'moov-count': null }
    const fragmentedDest = outPath()
    const fragmented = put(Buffer.concat([ftyp, box('moof', Buffer.alloc(16)), box('mdat', payload(64))]))
    bits.fragmented = expectFailure(fragmented, fragmentedDest)
    const noMdat = put(Buffer.concat([ftyp, moovWith('stco', [100])]))
    bits['no-mdat'] = expectFailure(noMdat, outPath())
    const twoMoov = put(Buffer.concat([ftyp, box('mdat', payload(64)), moovWith('stco', [50]), moovWith('stco', [60])]))
    bits['moov-count'] = expectFailure(twoMoov, outPath())

    report.check(bits.fragmented?.detail?.code === 'fragmented', 'refuse: a fragmented file is rejected')
    report.check(bits['no-mdat']?.detail?.code === 'no-mdat', 'refuse: a file without mdat is rejected')
    report.check(bits['moov-count']?.detail?.code === 'moov-count', 'refuse: two moov boxes are rejected')
    report.check(!existsSync(fragmentedDest), 'refuse: a refused transform creates no destination file')
  }

  {
    // An entry that would need 64 bits after shifting. A file that large cannot
    // be synthesized here, so the guard is driven directly: the mapper returns an
    // offset one past 2^32.
    const buffer = moovWith('stco', [100, 200])
    const error = (() => {
      try {
        patchChunkOffsets(buffer, () => 0x1_0000_0000)
        return null
      } catch (cause) {
        return cause
      }
    })()
    report.check(
      error?.detail?.code === 'needs-co64',
      'refuse: an stco entry that would need 64 bits is rejected, not silently grown',
      error === null ? 'nothing was thrown' : String(error.message),
    )
  }

  {
    const fixture = buildSlowFile()
    const source = put(fixture.bytes)
    const error = expectFailure(source, source)
    report.check(error?.detail?.code === 'same-path', 'refuse: writing over the source is rejected')
  }

  // ---- scan-level facts ----------------------------------------------------

  {
    const body = payload(128)
    const source = put(Buffer.concat([ftyp, box64('mdat', body), moovWith('stco', [ftyp.length + 16, ftyp.length + 32])]))
    const dest = outPath()
    const result = remuxFaststart(source, dest)
    const after = readFileSync(dest)
    report.check(
      result.status === REMUXED && topLevel(after).map((b) => b.type).join(',') === 'ftyp,moov,mdat',
      'largesize: an mdat using size===1 is handled',
    )
    const table = chunkTables(after)[0]
    const moov = topLevel(after).find((b) => b.type === 'moov')
    report.check(
      table.entries[0] === ftyp.length + 16 + moov.size,
      'largesize: its 16-byte header is accounted for in the shift',
      `got ${String(table.entries[0])}`,
    )
  }

  {
    // `size === 0` means "to the end of the file"; the scanner must model it
    // rather than read it as a zero-length box.
    const path = put(Buffer.concat([ftyp, Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('mdat', 'latin1'), payload(100)])]))
    const fd = (await import('node:fs')).openSync(path, 'r')
    const boxes = scanTopLevel(fd, readFileSync(path).length)
    ;(await import('node:fs')).closeSync(fd)
    report.check(
      boxes.length === 2 && boxes[1].type === 'mdat' && boxes[1].size === 108,
      'scan: a size===0 mdat is read as "to end of file"',
      JSON.stringify(boxes.map((b) => [b.type, b.size])),
    )
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

report.finish()
