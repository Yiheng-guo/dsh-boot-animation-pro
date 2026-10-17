/**
 * MP4 (ISO BMFF) box-level facts, without a media decoder.
 *
 * Why this file exists: `hasFaststart()` in `clip-registry.js` answers "is
 * `moov` in front of `mdat`" by searching the first 64KB for the literal bytes
 * `moov` and `mdat`. That is a text search, not a structural read, so it is
 * wrong in both directions on real files:
 *
 *   false positive — a `free`/`skip` padding box larger than the read window
 *   pushes `mdat` past 64KB while the literal `moov` appears inside the padding
 *   payload. The search finds `moov`, does not find `mdat`, and reports
 *   faststart for a file whose `moov` is actually last — the exact case the
 *   flag exists to warn about.
 *
 *   blind spots — `size === 1` (64-bit largesize) boxes and a `free` box that
 *   spans the window are not modelled at all, so the walk stops being
 *   meaningful and the answer is whatever the text search happened to see.
 *
 * This module walks the box headers instead, at the same cost: one bounded head
 * read, still never a full-file read.
 *
 * The probe is read-only and total: it reports `UNKNOWN` rather than throwing,
 * because "we could not tell" must never escalate into "this clip is broken".
 */

import { closeSync, openSync, readSync } from 'node:fs'

/** How much of a file to peek at. Same window the previous implementation used. */
export const FASTSTART_HEAD = 65536

/**
 * A 32-bit size of 0 means "this box runs to the end of the file" and a size of
 * 1 means a 64-bit largesize follows the type. Anything below the header size is
 * malformed.
 */
const BOX_HEADER_SIZE = 8
const LARGE_BOX_HEADER_SIZE = 16

/**
 * A legitimate file has a handful of top-level boxes (`ftyp`, `free`, `mdat`,
 * `moov`, sometimes `sidx`/`mfra`). The cap only exists so a malformed or
 * hostile file cannot make the walk unbounded.
 */
const MAX_TOP_LEVEL_BOXES = 64

/** `moov` precedes `mdat`: the file can start painting before it is fully fetched. */
export const FASTSTART = 'faststart'
/** `mdat` precedes `moov`: the player must fetch the whole file before it can paint. */
export const NOT_FASTSTART = 'not-faststart'
/** The head did not contain enough to decide. Not the same as "not faststart". */
export const UNKNOWN = 'unknown'

/**
 * @typedef {{ type: string, offset: number, size: number, headerSize: number }} TopLevelBox
 * @typedef {{ boxes: TopLevelBox[], truncated: boolean }} BoxWalk
 */

/**
 * Walk the top-level box headers of a buffer that starts at file offset 0.
 *
 * `truncated` means the walk stopped because a box extends past the buffer (or
 * the buffer ended mid-header). The boxes collected so far are still valid, and
 * `truncated` is what distinguishes "the head ended before `mdat`" from "the file
 * has no `mdat` at all".
 *
 * @param {Buffer} buffer
 * @returns {BoxWalk}
 */
export function readTopLevelBoxes(buffer) {
  /** @type {TopLevelBox[]} */
  const boxes = []
  let offset = 0

  while (offset + BOX_HEADER_SIZE <= buffer.length) {
    const size32 = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)

    let size = size32
    let headerSize = BOX_HEADER_SIZE

    if (size32 === 1) {
      if (offset + LARGE_BOX_HEADER_SIZE > buffer.length) {
        return { boxes, truncated: true }
      }
      // A 64-bit size cannot exceed Number.MAX_SAFE_INTEGER for a real file, so
      // reading it as two 32-bit halves is exact here.
      const high = buffer.readUInt32BE(offset + 8)
      const low = buffer.readUInt32BE(offset + 12)
      size = high * 2 ** 32 + low
      headerSize = LARGE_BOX_HEADER_SIZE
    } else if (size32 === 0) {
      // "To end of file". Within a bounded head we can only see to the end of
      // the window, so the box is recorded and the walk ends.
      size = buffer.length - offset
    }

    if (size < headerSize) return { boxes, truncated: true }

    boxes.push({ type, offset, size, headerSize })

    if (boxes.length >= MAX_TOP_LEVEL_BOXES) return { boxes, truncated: true }
    if (offset + size > buffer.length) return { boxes, truncated: true }
    offset += size
  }

  return { boxes, truncated: offset < buffer.length }
}

/**
 * Decide faststart from the boxes already walked.
 *
 * The first of `moov` / `mdat` wins, because that is what a progressive player
 * sees: it either reaches the index before the media, or it does not. Any other
 * box is skipped by its size, so bytes inside an `mdat` payload that happen to
 * spell `moov` cannot influence the answer — which is the whole point.
 *
 * A fragmented file (`moof`) is reported as `UNKNOWN`: its index is spread over
 * the fragment headers, so "is `moov` in front" is not the question that decides
 * whether it starts smoothly.
 *
 * Running out of boxes having seen neither also means `UNKNOWN`, and that must
 * not be collapsed into `NOT_FASTSTART`: a file with a large `free` padding box
 * carries its `moov` past the read window and is still progressive. Because the
 * caller trusts only `FASTSTART`, an `UNKNOWN` degrades to the conservative
 * answer without claiming to have located a late `moov` — which is exactly the
 * claim the previous implementation made and got wrong.
 *
 * @param {TopLevelBox[]} boxes
 * @returns {typeof FASTSTART | typeof NOT_FASTSTART | typeof UNKNOWN}
 */
export function faststartFromBoxes(boxes) {
  for (const box of boxes) {
    if (box.type === 'moov') return FASTSTART
    if (box.type === 'mdat') return NOT_FASTSTART
    if (box.type === 'moof') return UNKNOWN
  }
  return UNKNOWN
}

/**
 * Is `moov` in front of `mdat` in this file?
 *
 * Reads at most `headBytes` from the start. The common answers are settled by the
 * first two or three boxes, so the read is smaller than the window in practice.
 *
 * @param {string} filePath
 * @param {number} [headBytes]
 * @returns {typeof FASTSTART | typeof NOT_FASTSTART | typeof UNKNOWN}
 */
export function probeFaststart(filePath, headBytes = FASTSTART_HEAD) {
  let fd = null
  try {
    fd = openSync(filePath, 'r')
    const buffer = Buffer.alloc(headBytes)
    const read = readSync(fd, buffer, 0, headBytes, 0)
    const { boxes } = readTopLevelBoxes(buffer.subarray(0, read))
    return faststartFromBoxes(boxes)
  } catch {
    // A probe that cannot read the file must not be the thing that fails a scan.
    return UNKNOWN
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

/**
 * Can a container with this extension carry `moov` at all?
 *
 * `.mp4`/`.m4v`/`.mov` are ISO BMFF / QuickTime and can. `.webm`/`.mkv` are
 * Matroska, which has no `moov`; asking it for faststart would be a lie, so they
 * are reported as `false` by the caller rather than probed.
 *
 * @param {string} ext lower-case extension, including the dot
 */
export function canCarryMoov(ext) {
  return ext === '.mp4' || ext === '.m4v' || ext === '.mov'
}
