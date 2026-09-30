/**
 * library-ops.js — the one operation in this plugin that DESTROYS user data.
 *
 * Everything else the plugin writes is a settings file it can regenerate. This
 * module deletes a video the user put on disk, so it is written to refuse far more
 * often than it succeeds, and every refusal is a `ClipError` the route turns into
 * a visible message rather than a silent no-op.
 *
 * Four gates, all of which must pass:
 *
 *   1. the id must name a clip the registry actually listed;
 *   2. the clip must be a FILE clip — an embedded clip is bytes inside the
 *      package, and `builtin:brand` must never be interpreted as a path;
 *   3. the clip must be marked `writable` — that flag is set only for the
 *      directories the plugin manages, so a clip adopted from DSH_BOOT_ANIMATION
 *      (writable: false) is untouchable;
 *   4. the file's REAL path must still be inside a managed directory.
 *
 * Gate 4 is the one that matters. `writable` is decided when the listing is
 * built, and the listing is cached; a symlink swapped in afterwards, or a path
 * that leaves through `..` or a link, must not be able to redirect the delete.
 * Both sides are resolved with `realpathSync` before they are compared, so a
 * symlinked directory is compared as its target and the prefix test cannot be
 * fooled by a path that merely LOOKS like it is inside.
 */
import { lstatSync, realpathSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { ClipError } from './errors.js'

/**
 * Whether `child` is `parent` itself or sits underneath it.
 *
 * Compared on resolved paths with a trailing separator, so `/a/bc` is not treated
 * as living inside `/a/b`.
 */
function isInside(child, parent) {
  if (child === parent) return true
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep)
}

/** The real path of a directory that must already exist, or null. */
function realDir(path) {
  try {
    const real = realpathSync(path)
    return lstatSync(real).isDirectory() ? real : null
  } catch {
    return null
  }
}

/**
 * The scanned directory that contains `clip.path`, or null.
 *
 * Returns the directory ENTRY, not just its path, because "we do not scan there"
 * and "we scan there but it is not ours" are different refusals and the caller has
 * to be able to tell them apart to say something true to the user.
 *
 * @param {{ path?: string | null }} clip
 * @param {Array<{ dir: string, writable: boolean }>} dirs
 * @returns {{ dir: string, writable: boolean } | null}
 */
export function ownerDirOf(clip, dirs) {
  if (typeof clip?.path !== 'string' || clip.path === '') return null
  const realParent = realDir(dirname(resolve(clip.path)))
  if (realParent === null) return null
  for (const entry of dirs) {
    const real = realDir(entry.dir)
    if (real === null) continue
    if (isInside(realParent, real)) return { dir: real, writable: entry.writable === true }
  }
  return null
}

/**
 * Whether this clip can be deleted at all. Used by the client to decide whether
 * a row gets a delete button, so the answer and the action cannot disagree.
 *
 * @param {{ kind?: string, path?: string | null }} clip
 * @param {Array<{ dir: string, writable: boolean }>} dirs
 * @returns {boolean}
 */
export function isRemovable(clip, dirs) {
  if (clip?.kind !== 'file') return false
  const owner = ownerDirOf(clip, dirs)
  return owner !== null && owner.writable
}

/**
 * Delete one clip's file.
 *
 * @param {{ kind?: string, path?: string | null, name?: string }} clip
 * @param {Array<{ dir: string, writable: boolean }>} dirs
 * @returns {{ removed: string }}
 * @throws {ClipError} when any of the four gates refuses the delete
 */
export function removeClipFile(clip, dirs) {
  if (clip?.kind !== 'file') {
    throw new ClipError('only a file clip can be deleted; this clip lives inside the package')
  }
  if (typeof clip.path !== 'string' || clip.path === '') {
    throw new ClipError('this clip has no path on disk')
  }
  const target = resolve(clip.path)
  const owner = ownerDirOf(clip, dirs)
  if (owner === null) {
    throw new ClipError("refusing to delete a file outside the plugin's video directories", { status: 403 })
  }
  if (!owner.writable) {
    throw new ClipError(
      "that clip lives in the previous version's directory; this plugin only deletes files it manages",
      { status: 403 },
    )
  }
  let stats
  try {
    stats = lstatSync(target)
  } catch (cause) {
    throw new ClipError(`the file is already gone: ${String(cause?.message ?? cause)}`)
  }
  /**
   * `lstat`, so a symlink is seen as a symlink. Both a regular file and a symlink
   * are deletable, because `unlinkSync` on a symlink removes THE LINK and never
   * its target — a row the panel shows must be a row the panel can remove.
   * Everything else (a directory, a socket, a device) is refused.
   */
  if (!stats.isFile() && !stats.isSymbolicLink()) {
    throw new ClipError('refusing to delete something that is not a regular file')
  }
  try {
    unlinkSync(target)
  } catch (cause) {
    throw new ClipError(`could not delete the file: ${String(cause?.message ?? cause)}`)
  }
  return { removed: join(target) }
}
