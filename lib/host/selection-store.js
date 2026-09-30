/**
 * SelectionStore — the ONE place the user's choices live.
 *
 * `$DSH_HOME/boot-animation-pro/selection.json` holds settings and nothing else:
 * every field of the schema in `settings.js`, plus the schema version. There are
 * no media paths in it, no timestamps, and no per-playback state.
 *
 * Three rules, each of which is a bug this file exists to prevent:
 *
 * 1. NO MEDIA PATHS. Earlier shapes stored an id that could be a path, so a
 *    machine-specific absolute path ended up in a file that is meant to be
 *    portable and hand-editable. A ClipId is validated on the way in, and a path
 *    fails validation (it contains a separator) and is dropped.
 *
 * 2. A CORRUPT FILE IS NOT A STARTUP FAILURE. Any parse error, any wrong type,
 *    any unknown version resolves to defaults. The plugin must still load; the
 *    worst acceptable outcome is that the user's settings are forgotten, and that
 *    is reported through diagnostics rather than thrown.
 *
 * 3. MIGRATION IS A PURE FUNCTION, and it lives in `settings.js` next to the
 *    schema it migrates to. `migrate()` and `defaultSelection()` are re-exported
 *    here under their historical names, so there is still exactly one import site
 *    for "the settings file" and the old suites keep working.
 */
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SELECTION_VERSION, applyPatch as applySettingsPatch, defaultSettings, migrateSelection } from './settings.js'

export { SELECTION_VERSION }
/** Historical name for the pure migration, now owned by `settings.js`. */
export const migrate = migrateSelection
/** Historical name for a fresh settings object. */
export function defaultSelection() {
  return defaultSettings()
}

/**
 * Reads, validates, migrates and writes the selection file.
 *
 * Never throws out of `read()`: a selection store that can fail a boot is
 * exactly the class of defect this refactor exists to remove. `write()` DOES
 * throw, because a refused write has to reach the user instead of looking saved.
 */
export class SelectionStore {
  /**
   * @param {string} file absolute path to selection.json
   * @param {object} [options]
   * @param {{ event: (kind: string, detail?: unknown) => void }} [options.diagnostics]
   * @param {string | null} [options.legacyFile] the previous version's file, imported once
   */
  constructor(file, options = {}) {
    this.file = file
    this.diagnostics = options.diagnostics ?? null
    this.legacyFile = options.legacyFile ?? null
    /** @type {{ signature: string, selection: ReturnType<typeof defaultSettings> } | null} */
    this.cache = null
  }

  /** Signature of the file's current state, or null when it does not exist. */
  #signature() {
    try {
      const stats = statSync(this.file)
      return `${String(stats.size)}@${String(Math.round(stats.mtimeMs))}`
    } catch {
      return null
    }
  }

  /**
   * The current selection. Always a valid current-version object.
   * @returns {ReturnType<typeof defaultSettings>}
   */
  read() {
    const signature = this.#signature()
    if (this.cache !== null && this.cache.signature === signature) return this.cache.selection
    if (signature === null) {
      // No file yet: adopt the previous version's settings once, if it has any.
      // Done here rather than at `apply()` because `apply()` must not touch the
      // disk, and because "there is no settings file of our own yet" is exactly
      // the condition that makes the import correct.
      const imported = this.#importLegacy()
      if (imported !== null) {
        this.cache = { signature: this.#signature(), selection: imported }
        return imported
      }
      // Do not cache a negative: the first write must be picked up without an
      // invalidation dance.
      this.cache = null
      return defaultSelection()
    }

    let parsed = null
    let parseFailed = false
    try {
      parsed = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch (error) {
      parseFailed = true
      this.diagnostics?.event('selection-unreadable', { reason: String(error?.message ?? error) })
    }

    const { selection, migrated, reason } = migrateSelection(parseFailed ? null : parsed)
    if (parseFailed) {
      this.diagnostics?.event('selection-reset', { reason: 'file could not be parsed; defaults restored' })
      // REPAIR, not just tolerate. "A corrupt file does not stop the plugin" is
      // only half the requirement; the other half is that the file comes back
      // valid, so the next read is an ordinary one and a hand-edit habit does
      // not leave the store permanently degraded.
      try {
        this.#write(selection)
      } catch (error) {
        this.diagnostics?.event('selection-reset-write-failed', { reason: String(error?.message ?? error) })
      }
    } else if (migrated) {
      this.diagnostics?.event('selection-migrated', { reason })
      // Persist the migration so the next start is a plain current-version read.
      // A failure here must not stop the plugin: the in-memory value is correct.
      try {
        this.#write(selection)
      } catch (error) {
        this.diagnostics?.event('selection-migrate-write-failed', { reason: String(error?.message ?? error) })
      }
    }
    this.cache = { signature: this.#signature(), selection }
    return selection
  }

  /**
   * Read the previous version's settings file, migrate it, and write our own.
   *
   * Never throws: an unreadable predecessor is worth a diagnostic line and
   * nothing else. A predecessor that exists but carries no usable value is still
   * copied across, so the import runs once rather than on every read.
   *
   * @returns {ReturnType<typeof defaultSettings> | null} the imported settings, or
   *   null when there was nothing to import
   */
  #importLegacy() {
    if (typeof this.legacyFile !== 'string' || this.legacyFile === '') return null
    let raw
    try {
      raw = readFileSync(this.legacyFile, 'utf8')
    } catch {
      return null
    }
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      this.diagnostics?.event('selection-import-unreadable', { reason: String(error?.message ?? error) })
    }
    const { selection, reason } = migrateSelection(parsed)
    this.diagnostics?.event('selection-imported', { reason: reason === '' ? 'predecessor settings adopted' : reason })
    try {
      this.#write(selection)
    } catch (error) {
      this.diagnostics?.event('selection-import-write-failed', { reason: String(error?.message ?? error) })
    }
    return selection
  }

  /**
   * Merge a patch into the selection and persist it.
   *
   * Validation is entirely `settings.js`'s job: this method decides nothing about
   * what a field means. An unknown key or an impossible value raises a ClipError
   * and the file is left untouched.
   *
   * @param {Record<string, unknown>} patch
   * @param {{ knownClipIds?: Set<string> }} [options]
   * @returns {ReturnType<typeof defaultSettings>}
   */
  write(patch, options = {}) {
    const next = applySettingsPatch(this.read(), patch, options)
    this.#write(next)
    this.cache = { signature: this.#signature(), selection: next }
    return next
  }

  /** Atomic-ish replace: a half-written file would silently reset every setting. */
  #write(selection) {
    mkdirSync(dirname(this.file), { recursive: true })
    const payload = JSON.stringify(selection, null, 2) + '\n'
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, payload, 'utf8')
    try {
      renameSync(tmp, this.file)
    } catch {
      writeFileSync(this.file, payload, 'utf8')
    }
  }
}
