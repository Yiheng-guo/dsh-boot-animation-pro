/**
 * Move `moov` in front of `mdat`, without decoding anything.
 *
 * This is the fix the faststart PROBE can only warn about. A file whose index
 * sits after the media cannot paint until the last byte arrives, which on a
 * `boot-animation` clip means a black screen where the intro should be. The
 * bytes are fine; only their order is wrong.
 *
 * Reordering boxes is a container operation, so no codec, no ffmpeg and no
 * WebCodecs are involved. That matters for where this can run: the host half is
 * plain JS, and a dependency-free transform is the only version that could be
 * applied to a clip at all.
 *
 * ## The one invariant that makes this safe
 *
 * Moving `moov` changes the absolute position of every byte after it, and
 * `stco`/`co64` inside `moov` store those absolute positions for every chunk.
 * So the transform is: move the box, then rewrite those offsets by exactly the
 * same amount. Total byte count does not change — the file is the same bytes in
 * a different order. That is asserted after writing.
 *
 * ## Offset mapping, in full
 *
 * With `M` = moov size and `P` = start of the first `mdat` (where `moov` is
 * inserted):
 *
 *   x <  P            -> x            (prefix, untouched)
 *   P <= x < moov.start -> x + M      (everything the insertion pushes back)
 *   moov.start <= x < moov.end -> unreachable: no chunk points inside moov
 *   x >= moov.end     -> x            (bytes that were behind moov and stay behind it)
 *
 * The last row is why a single global delta is wrong for a file whose `moov` sits
 * in the middle (`ftyp, mdat, moov, mdat`): the second `mdat` is pushed forward
 * by the insertion and pulled back by the removal, so its net shift is zero.
 * Mapping per offset, rather than adding one delta, is what handles that.
 *
 * ## Where `moov` lands
 *
 * Immediately before the first `mdat`. Any `free`/`skip` padding that sat between
 * the two therefore ends up in FRONT of `moov`, which is a different byte order
 * from ffmpeg's canonical `ftyp, moov, mdat` and the same file in every way that
 * matters. The alternative — placing `moov` right after `ftyp` — would displace
 * the padding too, for no benefit, and this rule keeps the transform to exactly
 * one box moving.
 *
 * A consequence worth relying on: the transform is idempotent. Running it over its
 * own output hits the `already` branch and writes nothing, rather than reordering
 * again.
 *
 * ## Deliberately not supported
 *
 * - Fragmented files (`moof`). Their index is spread across fragments; "moov in
 *   front" is not the property that decides whether they start smoothly.
 * - Rewriting a `stco` that would overflow 32 bits. Converting `stco` -> `co64`
 *   changes the `moov` size, which changes the offsets, which is a fixpoint the
 *   caller should ask for explicitly rather than get silently.
 * - Replacing the original. The transform writes a NEW file; overwriting is a
 *   destructive operation that belongs behind the route guard, not inside a
 *   byte transform.
 */

import { closeSync, openSync, readSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { ClipError } from './errors.js'

const BOX_HEADER_SIZE = 8
const LARGE_BOX_HEADER_SIZE = 16
const COPY_CHUNK = 1 << 20

/** Boxes that contain other boxes and may therefore contain a `stbl`. */
const CONTAINER_TYPES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex'])

/** Guard against a nonsensical box run, so a hostile file cannot loop us. */
const MAX_BOXES = 4096

/** A `moov` this large is not an index, it is a bug; refuse rather than allocate. */
const MAX_MOOV_BYTES = 256 * 1024 * 1024

/** Outcome: the file was rewritten and the index is now in front. */
export const REMUXED = 'remuxed'
/** Outcome: nothing to do, `moov` was already in front. No file is written. */
export const ALREADY_FASTSTART = 'already-faststart'

/** @typedef {{ type: string, start: number, size: number, headerSize: number, end: number }} Box */

/**
 * Read the top-level box headers of a file, without loading its contents.
 *
 * @param {number} fd
 * @param {number} fileSize
 * @returns {Box[]}
 * @throws {ClipError} when the box chain does not describe the file
 */
export function scanTopLevel(fd, fileSize) {
  /** @type {Box[]} */
  const boxes = []
  let offset = 0
  while (offset + BOX_HEADER_SIZE <= fileSize) {
    if (boxes.length >= MAX_BOXES) {
      throw new ClipError('too many top-level boxes', { status: 422, detail: { code: 'too-many-boxes' } })
    }
    const header = Buffer.alloc(LARGE_BOX_HEADER_SIZE)
    const read = readSync(fd, header, 0, LARGE_BOX_HEADER_SIZE, offset)
    if (read < BOX_HEADER_SIZE) break

    const size32 = header.readUInt32BE(0)
    const type = header.toString('latin1', 4, 8)
    let size = size32
    let headerSize = BOX_HEADER_SIZE

    if (size32 === 1) {
      if (read < LARGE_BOX_HEADER_SIZE) {
        throw new ClipError('truncated 64-bit box header', { status: 422, detail: { code: 'truncated-header' } })
      }
      size = header.readUInt32BE(8) * 2 ** 32 + header.readUInt32BE(12)
      headerSize = LARGE_BOX_HEADER_SIZE
    } else if (size32 === 0) {
      size = fileSize - offset
    }

    if (size < headerSize) {
      throw new ClipError('box size smaller than its header', {
        status: 422,
        detail: { code: 'bad-box-size', type },
      })
    }
    if (offset + size > fileSize) {
      throw new ClipError('box extends past the end of the file', {
        status: 422,
        detail: { code: 'truncated-box', type },
      })
    }

    boxes.push({ type, start: offset, size, headerSize, end: offset + size })
    offset += size
  }
  return boxes
}

/**
 * Decide what, if anything, has to move.
 *
 * `P` is the start of the first `mdat`: putting `moov` there is the smallest
 * reordering that makes the file progressive, and it keeps every byte of the
 * prefix where it already was.
 *
 * @param {Box[]} boxes
 * @returns {{ already: true } | { already: false, moov: Box, insertAt: number }}
 */
export function planRemux(boxes) {
  const moovs = boxes.filter((b) => b.type === 'moov')
  const mdats = boxes.filter((b) => b.type === 'mdat')

  if (boxes.some((b) => b.type === 'moof')) {
    throw new ClipError('fragmented file: no single moov to move', {
      status: 422,
      detail: { code: 'fragmented' },
    })
  }
  if (moovs.length !== 1) {
    throw new ClipError(`expected exactly one moov, found ${String(moovs.length)}`, {
      status: 422,
      detail: { code: 'moov-count', count: moovs.length },
    })
  }
  if (mdats.length === 0) {
    throw new ClipError('no mdat: nothing to move the index in front of', {
      status: 422,
      detail: { code: 'no-mdat' },
    })
  }

  const moov = moovs[0]
  const insertAt = mdats[0].start
  if (moov.start < insertAt) return { already: true }
  return { already: false, moov, insertAt }
}

/**
 * Map an absolute offset in the OLD file to the same byte in the NEW file.
 *
 * Returns `null` for an offset that falls inside `moov`, which no media chunk may
 * do — that is a corrupt index, not a mapping question.
 *
 * @param {{ start: number, end: number, size: number }} moov
 * @param {number} insertAt
 * @returns {(offset: number) => number | null}
 */
export function makeOffsetMapper(moov, insertAt) {
  const shift = moov.size
  return (offset) => {
    if (offset < insertAt) return offset
    if (offset < moov.start) return offset + shift
    if (offset < moov.end) return null
    return offset
  }
}

/**
 * Walk boxes inside a buffer region, recursing into containers.
 *
 * @param {Buffer} buffer
 * @param {number} start
 * @param {number} end
 * @param {(type: string, boxStart: number, size: number, headerSize: number) => void} visit
 */
function walkBoxes(buffer, start, end, visit) {
  let offset = start
  let seen = 0
  while (offset + BOX_HEADER_SIZE <= end) {
    if (++seen > MAX_BOXES) return
    const size32 = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    let size = size32
    let headerSize = BOX_HEADER_SIZE

    if (size32 === 1) {
      if (offset + LARGE_BOX_HEADER_SIZE > end) return
      size = buffer.readUInt32BE(offset + 8) * 2 ** 32 + buffer.readUInt32BE(offset + 12)
      headerSize = LARGE_BOX_HEADER_SIZE
    } else if (size32 === 0) {
      size = end - offset
    }

    // A malformed child stops the walk instead of throwing: the caller is
    // patching offsets it has already validated, and a partially readable index
    // is a clip error, not a plugin error.
    if (size < headerSize || offset + size > end) return

    visit(type, offset, size, headerSize)
    if (CONTAINER_TYPES.has(type)) walkBoxes(buffer, offset + headerSize, offset + size, visit)
    offset += size
  }
}

/**
 * Rewrite every `stco`/`co64` entry inside a `moov` buffer.
 *
 * `stco` payload: 4 bytes version+flags, 4 bytes entry_count, then 32-bit
 * offsets. `co64` is the same with 64-bit offsets.
 *
 * @param {Buffer} moovBuffer the whole `moov` box, header included
 * @param {(offset: number) => number | null} mapOffset
 * @returns {{ stco: number, co64: number, chunks: number }} how much was rewritten
 */
export function patchChunkOffsets(moovBuffer, mapOffset) {
  const counts = { stco: 0, co64: 0, chunks: 0 }

  walkBoxes(moovBuffer, BOX_HEADER_SIZE, moovBuffer.length, (type, boxStart, size, headerSize) => {
    if (type !== 'stco' && type !== 'co64') return
    const width = type === 'stco' ? 4 : 8
    const payload = boxStart + headerSize
    const tableEnd = boxStart + size
    if (payload + 8 > tableEnd) {
      throw new ClipError(`${type} is too short to hold a count`, {
        status: 422,
        detail: { code: 'bad-chunk-table', type },
      })
    }
    const count = moovBuffer.readUInt32BE(payload + 4)
    if (payload + 8 + count * width > tableEnd) {
      throw new ClipError(`${type} entry_count exceeds the box`, {
        status: 422,
        detail: { code: 'bad-chunk-count', type, count },
      })
    }

    for (let index = 0; index < count; index += 1) {
      const at = payload + 8 + index * width
      const old = type === 'stco' ? moovBuffer.readUInt32BE(at) : Number(moovBuffer.readBigUInt64BE(at))
      if (!Number.isSafeInteger(old)) {
        throw new ClipError(`${type} holds an offset that is not exactly representable`, {
          status: 422,
          detail: { code: 'offset-precision', type },
        })
      }
      const next = mapOffset(old)
      if (next === null) {
        throw new ClipError('a chunk offset points inside moov', {
          status: 422,
          detail: { code: 'chunk-in-moov', type, index },
        })
      }
      if (type === 'stco') {
        if (next > 0xffffffff) {
          // The honest failure: silently growing stco to co64 would change the
          // moov size and therefore every offset we just computed.
          throw new ClipError('rewriting stco would overflow 32 bits; co64 conversion is a separate operation', {
            status: 422,
            detail: { code: 'needs-co64', index, wanted: next },
          })
        }
        moovBuffer.writeUInt32BE(next, at)
      } else {
        moovBuffer.writeBigUInt64BE(BigInt(next), at)
      }
      counts.chunks += 1
    }
    counts[type] += 1
  })

  return counts
}

/** Copy `[start, end)` from one fd to another, in bounded chunks. */
function copyRange(srcFd, dstFd, start, end) {
  const buffer = Buffer.allocUnsafe(COPY_CHUNK)
  let position = start
  while (position < end) {
    const want = Math.min(COPY_CHUNK, end - position)
    const got = readSync(srcFd, buffer, 0, want, position)
    if (got <= 0) {
      throw new ClipError('source ended while copying', {
        status: 500,
        detail: { code: 'short-read', position },
      })
    }
    let written = 0
    while (written < got) {
      written += writeSync(dstFd, buffer, written, got - written)
    }
    position += got
  }
}

/**
 * Write a copy of `sourcePath` whose `moov` precedes its `mdat`.
 *
 * The source is opened read-only and never modified. The destination is written
 * from scratch and removed again if anything fails, so a failed transform cannot
 * leave a half-file behind for the registry to list.
 *
 * @param {string} sourcePath
 * @param {string} destPath
 * @returns {{ status: typeof REMUXED | typeof ALREADY_FASTSTART, bytes: number, chunks: number }}
 * @throws {ClipError}
 */
export function remuxFaststart(sourcePath, destPath) {
  if (sourcePath === destPath) {
    throw new ClipError('source and destination must differ', {
      status: 400,
      detail: { code: 'same-path' },
    })
  }

  const fileSize = statSync(sourcePath).size
  const srcFd = openSync(sourcePath, 'r')
  let dstFd = null
  let committed = false
  try {
    const boxes = scanTopLevel(srcFd, fileSize)
    const plan = planRemux(boxes)
    if (plan.already) return { status: ALREADY_FASTSTART, bytes: fileSize, chunks: 0 }

    const { moov, insertAt } = plan
    if (moov.size > MAX_MOOV_BYTES) {
      throw new ClipError('moov is implausibly large', {
        status: 422,
        detail: { code: 'moov-too-large', bytes: moov.size },
      })
    }

    const moovBuffer = Buffer.allocUnsafe(moov.size)
    readSync(srcFd, moovBuffer, 0, moov.size, moov.start)

    const counts = patchChunkOffsets(moovBuffer, makeOffsetMapper(moov, insertAt))

    dstFd = openSync(destPath, 'w')
    copyRange(srcFd, dstFd, 0, insertAt)
    let written = 0
    while (written < moovBuffer.length) {
      written += writeSync(dstFd, moovBuffer, written, moovBuffer.length - written)
    }
    copyRange(srcFd, dstFd, insertAt, moov.start)
    copyRange(srcFd, dstFd, moov.end, fileSize)
    closeSync(dstFd)
    dstFd = null

    // The transform only reorders bytes, so the size must be identical. If it is
    // not, the box arithmetic above was wrong and the output must not be adopted.
    const after = statSync(destPath).size
    if (after !== fileSize) {
      throw new ClipError('remux changed the file size, which it must not', {
        status: 500,
        detail: { code: 'size-drift', before: fileSize, after },
      })
    }

    committed = true
    return { status: REMUXED, bytes: fileSize, chunks: counts.chunks }
  } finally {
    closeSync(srcFd)
    if (dstFd !== null) closeSync(dstFd)
    if (!committed) {
      try {
        unlinkSync(destPath)
      } catch {
        /* nothing was created, or it is already gone */
      }
    }
  }
}
