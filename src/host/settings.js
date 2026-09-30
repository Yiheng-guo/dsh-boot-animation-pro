/**
 * settings.js — the schema of everything the user can configure, in one place.
 *
 * `selection-store.js` owns the FILE (read, migrate, atomic write). This module
 * owns the SHAPE: what fields exist, what each one accepts, and how a raw value
 * becomes a valid one. Two callers, two different policies, one schema:
 *
 *   migrateSelection(raw)   never throws. Junk on disk resolves to the closest
 *                           valid setting. A hand-edited file must never be able
 *                           to stop the plugin from loading.
 *   applyPatch(current, p)  throws ClipError. A wire patch is written by code we
 *                           ship, so an unknown field or an impossible value is a
 *                           programming error and must be loud, not silently
 *                           coerced into something the caller did not ask for.
 *
 * Every bound in this file is a real one, not decoration:
 *
 *  - text fields are length-bounded because they are rendered into the DOM by the
 *    client, and the selection file is a file a user can edit;
 *  - `timeRules` is bounded and each rule is fully validated because the resolver
 *    reads it on the playback path;
 *  - list fields (`favorites`, `sessionList.ids`) are bounded so a runaway client
 *    cannot grow the settings file without limit.
 *
 * The field list itself is data (`SETTINGS_FIELDS`), so the wire contract, the
 * on-disk contract and the tests all read the same source of truth instead of
 * three hand-maintained copies.
 */
import { normalizeClipId } from './clip-id.js'
import { ClipError } from './errors.js'

/** Current on-disk schema. Bump together with `migrateSelection`. */
export const SELECTION_VERSION = 3

// ---------------------------------------------------------------- enumerations

export const FIT_MODES = ['cover', 'contain']

/**
 * When the intro plays, as one client-side rule.
 *
 *   new-and-pinned  the shipped behaviour: a new conversation once, plus any
 *                   conversation the user pinned
 *   new-only        every new conversation, and nothing else
 *   always          every conversation, every time it is entered
 *   startup-only    once per page load, whatever conversation is open
 *   off             the plugin stays mounted but never plays on its own
 */
export const TRIGGER_MODES = ['new-and-pinned', 'new-only', 'always', 'startup-only', 'off']

/** How the picker orders rows. `default` keeps embedded-first, newest-yours-next. */
export const SORT_MODES = ['default', 'name', 'size', 'newest', 'oldest']

/** Decorative treatment drawn over the video by the overlay. */
export const OVERLAY_EFFECTS = ['none', 'scanlines', 'vignette', 'grain', 'glow']

/** `auto` follows the browser's own language at render time. */
export const LOCALES = ['auto', 'zh', 'en']

/** Whether `sessionList.ids` names the only sessions that play, or the ones that do not. */
export const SESSION_LIST_MODES = ['off', 'allow', 'deny']

// --------------------------------------------------------------------- bounds

export const VOLUME_RANGE = [0, 1]
export const RATE_RANGE = [0.25, 2]
export const AUTO_SKIP_RANGE = [0, 60]
export const COOLDOWN_RANGE = [0, 1440]
export const FADE_RANGE = [0, 3000]

export const MAX_TEXT = 80
export const MAX_ALIASES = 200
export const MAX_FAVORITES = 200
export const MAX_SESSION_IDS = 100
export const MAX_TIME_RULES = 12
export const MAX_SESSION_ID_LENGTH = 300

// ------------------------------------------------------------------ coercions

/** Strict boolean: only the literal `true` counts, as in every prior version. */
function coerceBoolean(value) {
  return value === true
}

/** A finite number inside `[min, max]`, else the fallback. Never NaN. */
function coerceNumber(value, [min, max], fallback) {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function coerceEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

/** Free text for the overlay: one line, no control characters, length-bounded. */
function coerceText(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  // Newlines and tabs would break the single-line overlay layout; NUL and other
  // C0 controls have no legitimate place in a caption.
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  return cleaned.slice(0, MAX_TEXT)
}

/** A ClipId, or null. Rejects paths and traversal exactly like the store does. */
function coerceClipId(value) {
  if (value === null || value === undefined) return null
  return normalizeClipId(value)
}

/**
 * A session id, as the DSH client publishes it.
 *
 * Session ids are opaque and NOT ClipIds — they may be UUIDs, and they are never
 * turned into a filesystem path — but they are still a value that arrives over
 * the wire and lands in a JSON file, so the same shape rules apply: bounded,
 * no separators that could look like a path, no traversal.
 */
export function coerceSessionId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > MAX_SESSION_ID_LENGTH) return null
  if (!/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return null
  if (trimmed.includes('..')) return null
  return trimmed
}

/** `HH:MM`, 24-hour. Null when it is not a time. */
export function coerceTime(value) {
  if (typeof value !== 'string') return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  return match === null ? null : match[0]
}

/** Weekday numbers, 0 = Sunday, matching `Date#getDay`. Sorted and de-duplicated. */
function coerceDays(value) {
  if (!Array.isArray(value)) return []
  const days = new Set()
  for (const day of value) {
    const n = typeof day === 'number' ? day : Number.NaN
    if (Number.isInteger(n) && n >= 0 && n <= 6) days.add(n)
  }
  return [...days].sort((a, b) => a - b)
}

/** Minutes since midnight for an `HH:MM` string. */
export function minutesOf(time) {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

/**
 * One time rule, or null when it cannot be a rule.
 *
 * `days` is the set of weekdays the window STARTS on. For a window that wraps
 * past midnight (`22:00`-`02:00`) that is the only reading that keeps a rule
 * describing "Friday night" instead of silently meaning "Saturday morning"; see
 * `schedule.js`, which is where that reading is applied.
 */
function coerceTimeRule(value, index) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const clipId = coerceClipId(value.clipId)
  const start = coerceTime(value.start)
  const end = coerceTime(value.end)
  const days = coerceDays(value.days)
  if (clipId === null || start === null || end === null) return null
  const id = coerceText(value.id) || `rule-${String(index + 1)}`
  return {
    id,
    clipId,
    label: coerceText(value.label),
    days: days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : days,
    start,
    end,
    enabled: value.enabled !== false,
  }
}

function coerceTimeRules(value) {
  if (!Array.isArray(value)) return []
  const rules = []
  const seen = new Set()
  for (const [index, raw] of value.entries()) {
    const rule = coerceTimeRule(raw, index)
    if (rule === null) continue
    // Two rules under one id would make "remove" ambiguous; keep the first.
    if (seen.has(rule.id)) continue
    seen.add(rule.id)
    rules.push(rule)
    if (rules.length >= MAX_TIME_RULES) break
  }
  return rules
}

/** `{ clipId: displayName }`, both sides validated, bounded. */
function coerceAliases(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const aliases = {}
  let kept = 0
  for (const [key, raw] of Object.entries(value)) {
    if (kept >= MAX_ALIASES) break
    const clipId = coerceClipId(key)
    if (clipId === null || clipId === 'active') continue
    const name = coerceText(raw)
    if (name === '') continue
    aliases[clipId] = name
    kept += 1
  }
  return aliases
}

function coerceClipIdList(value, limit) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const raw of value) {
    const id = coerceClipId(raw)
    if (id === null || id === 'active' || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= limit) break
  }
  return out
}

function coerceSessionList(value) {
  const fallback = { mode: 'off', ids: [] }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fallback
  const mode = coerceEnum(value.mode, SESSION_LIST_MODES, 'off')
  const ids = []
  const seen = new Set()
  if (Array.isArray(value.ids)) {
    for (const raw of value.ids) {
      const id = coerceSessionId(raw)
      if (id === null || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
      if (ids.length >= MAX_SESSION_IDS) break
    }
  }
  return { mode, ids }
}

// -------------------------------------------------------------------- schema

/**
 * A fresh selection. Every field is spelled out so the on-disk shape is
 * greppable and a new field cannot be added by accident.
 */
export function defaultSettings() {
  return {
    version: SELECTION_VERSION,
    selectedClipId: null,
    randomPlayback: false,
    fitMode: 'cover',
    // Playback controls.
    volume: 1,
    muted: true,
    playbackRate: 1,
    showProgress: true,
    autoSkipSeconds: 0,
    fadeOutMs: 400,
    // Trigger rules.
    triggerMode: 'new-and-pinned',
    cooldownMinutes: 0,
    sessionList: { mode: 'off', ids: [] },
    // Library management.
    aliases: {},
    favorites: [],
    sortMode: 'default',
    // Overlay decoration.
    overlayTitle: '',
    overlaySubtitle: '',
    watermark: '',
    overlayEffect: 'none',
    // Time-based clip selection.
    timeRules: [],
    // Interface language.
    locale: 'auto',
  }
}

/**
 * The set of patchable settings fields, in the order they are documented.
 *
 * `version` is deliberately absent: it names the FILE schema and is never a user
 * setting. `applyPatch` rejects it, which is what keeps a wire patch from
 * rewriting the schema stamp of the file it is merged into.
 */
export const SETTINGS_FIELDS = /** @type {const} */ ([
  'selectedClipId',
  'randomPlayback',
  'fitMode',
  'volume',
  'muted',
  'playbackRate',
  'showProgress',
  'autoSkipSeconds',
  'fadeOutMs',
  'triggerMode',
  'cooldownMinutes',
  'sessionList',
  'aliases',
  'favorites',
  'sortMode',
  'overlayTitle',
  'overlaySubtitle',
  'watermark',
  'overlayEffect',
  'timeRules',
  'locale',
])

/**
 * Every setting, coerced from whatever was on disk.
 *
 * Pure and total: there is no input, including a hostile one, that makes this
 * throw. That property is what lets `SelectionStore.read()` promise that a
 * corrupt file can only ever cost the user their pick, never a boot.
 *
 * @param {unknown} source
 * @returns {{ selection: ReturnType<typeof defaultSettings>, migrated: boolean, reason: string }}
 */
export function migrateSelection(source) {
  if (source === null || source === undefined || typeof source !== 'object' || Array.isArray(source)) {
    return { selection: defaultSettings(), migrated: false, reason: 'no usable value on disk' }
  }
  const raw = /** @type {Record<string, unknown>} */ (source)
  const declared = typeof raw.version === 'number' ? raw.version : null

  // v1 (0.1.x - 0.2.x) spelled the pick as a bare `id`. Reading it here is what
  // keeps an installed copy's choice across the upgrade.
  const legacyId = typeof raw.id === 'string' ? raw.id : null
  const modernId = typeof raw.selectedClipId === 'string' ? raw.selectedClipId : null
  const rawId = modernId ?? legacyId

  const defaults = defaultSettings()
  const selection = {
    ...defaults,
    selectedClipId: coerceClipId(rawId),
    randomPlayback: coerceBoolean(raw.randomPlayback),
    // `fit` is the 0.2.x spelling that lived in localStorage and was written into
    // the file by the first migration; it stays readable.
    fitMode: coerceEnum(raw.fitMode ?? raw.fit, FIT_MODES, defaults.fitMode),
    volume: coerceNumber(raw.volume, VOLUME_RANGE, defaults.volume),
    muted: raw.muted === undefined ? defaults.muted : coerceBoolean(raw.muted),
    playbackRate: coerceNumber(raw.playbackRate, RATE_RANGE, defaults.playbackRate),
    showProgress: raw.showProgress === undefined ? defaults.showProgress : coerceBoolean(raw.showProgress),
    autoSkipSeconds: coerceNumber(raw.autoSkipSeconds, AUTO_SKIP_RANGE, defaults.autoSkipSeconds),
    fadeOutMs: coerceNumber(raw.fadeOutMs, FADE_RANGE, defaults.fadeOutMs),
    triggerMode: coerceEnum(raw.triggerMode, TRIGGER_MODES, defaults.triggerMode),
    cooldownMinutes: coerceNumber(raw.cooldownMinutes, COOLDOWN_RANGE, defaults.cooldownMinutes),
    sessionList: coerceSessionList(raw.sessionList),
    aliases: coerceAliases(raw.aliases),
    favorites: coerceClipIdList(raw.favorites, MAX_FAVORITES),
    sortMode: coerceEnum(raw.sortMode, SORT_MODES, defaults.sortMode),
    overlayTitle: coerceText(raw.overlayTitle),
    overlaySubtitle: coerceText(raw.overlaySubtitle),
    watermark: coerceText(raw.watermark),
    overlayEffect: coerceEnum(raw.overlayEffect, OVERLAY_EFFECTS, defaults.overlayEffect),
    timeRules: coerceTimeRules(raw.timeRules),
    locale: coerceEnum(raw.locale, LOCALES, defaults.locale),
  }

  const migrated = declared !== SELECTION_VERSION
  const reason = migrated
    ? declared === null
      ? 'no version stamp; read as the legacy shape'
      : `version ${String(declared)} -> ${String(SELECTION_VERSION)}`
    : ''
  return { selection, migrated, reason }
}

// ---------------------------------------------------------------- patch writes

function requireTime(value, key) {
  const time = coerceTime(value)
  if (time === null) throw new ClipError(`${key} must be HH:MM, got: ${JSON.stringify(value)}`)
  return time
}

/**
 * Build one time rule from a wire patch, generating its id on the host.
 *
 * The id is generated here rather than accepted from the client so that "remove
 * the rule with this id" always refers to something the host actually created.
 */
function buildTimeRule(patch, index) {
  const clipId = coerceClipId(patch?.clipId)
  if (clipId === null || clipId === 'active') {
    throw new ClipError(`addTimeRule needs a real clipId, got: ${JSON.stringify(patch?.clipId)}`)
  }
  const days = coerceDays(patch?.days)
  return {
    id: `rule-${Date.now().toString(36)}-${String(index)}`,
    clipId,
    label: coerceText(patch?.label),
    days: days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : days,
    start: requireTime(patch?.start, 'addTimeRule.start'),
    end: requireTime(patch?.end, 'addTimeRule.end'),
    enabled: patch?.enabled !== false,
  }
}

/**
 * Merge a validated patch into `current` and return the next selection.
 *
 * Pure, so the wire handler can validate before it touches the disk, and a test
 * can exercise every rejection without writing a file.
 *
 * @param {ReturnType<typeof defaultSettings>} current
 * @param {Record<string, unknown>} patch
 * @param {{ knownClipIds?: Set<string> }} [options] ids that may be referenced
 * @returns {ReturnType<typeof defaultSettings>}
 * @throws {ClipError} on an unknown field, or a value of the wrong type/shape
 */
export function applyPatch(current, patch, options = {}) {
  const known = options.knownClipIds ?? null
  const next = {
    ...current,
    sessionList: { ...current.sessionList, ids: [...current.sessionList.ids] },
    aliases: { ...current.aliases },
    favorites: [...current.favorites],
    timeRules: current.timeRules.map((rule) => ({ ...rule, days: [...rule.days] })),
  }

  /** A clip id that must already exist, because a dangling reference would be dead UI. */
  const requireKnownClip = (value, key) => {
    const id = coerceClipId(value)
    if (id === null || id === 'active') {
      throw new ClipError(`${key} must be a real ClipId, got: ${JSON.stringify(value)}`)
    }
    if (known !== null && !known.has(id)) {
      throw new ClipError(`${key} names an unknown clip: ${id}`, { status: 404 })
    }
    return id
  }

  const setters = {
    selectedClipId(value) {
      // `null` is a real value here, not "no change": it is how the panel clears a
      // pick, and it is what `POST /remove` writes when the chosen clip is the file
      // it just deleted. Treating it as a no-op left a dangling selection behind.
      if (value === null) {
        next.selectedClipId = null
        return
      }
      next.selectedClipId = requireKnownClip(value, 'selectedClipId')
    },
    randomPlayback(value) {
      next.randomPlayback = coerceBoolean(value)
    },
    fitMode(value) {
      if (!FIT_MODES.includes(value)) throw new ClipError(`fitMode must be one of ${FIT_MODES.join('/')}`)
      next.fitMode = value
    },
    volume(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new ClipError('volume must be a number')
      next.volume = coerceNumber(value, VOLUME_RANGE, next.volume)
    },
    muted(value) {
      if (typeof value !== 'boolean') throw new ClipError('muted must be a boolean')
      next.muted = value
    },
    playbackRate(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new ClipError('playbackRate must be a number')
      next.playbackRate = coerceNumber(value, RATE_RANGE, next.playbackRate)
    },
    showProgress(value) {
      if (typeof value !== 'boolean') throw new ClipError('showProgress must be a boolean')
      next.showProgress = value
    },
    autoSkipSeconds(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new ClipError('autoSkipSeconds must be a number')
      next.autoSkipSeconds = coerceNumber(value, AUTO_SKIP_RANGE, next.autoSkipSeconds)
    },
    fadeOutMs(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new ClipError('fadeOutMs must be a number')
      next.fadeOutMs = coerceNumber(value, FADE_RANGE, next.fadeOutMs)
    },
    triggerMode(value) {
      if (!TRIGGER_MODES.includes(value)) throw new ClipError(`triggerMode must be one of ${TRIGGER_MODES.join('/')}`)
      next.triggerMode = value
    },
    cooldownMinutes(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new ClipError('cooldownMinutes must be a number')
      next.cooldownMinutes = coerceNumber(value, COOLDOWN_RANGE, next.cooldownMinutes)
    },
    sessionList(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new ClipError('sessionList must be an object { mode, ids }')
      }
      if (!SESSION_LIST_MODES.includes(value.mode)) {
        throw new ClipError(`sessionList.mode must be one of ${SESSION_LIST_MODES.join('/')}`)
      }
      // A malformed id is rejected rather than skipped: dropping one silently
      // would turn a deny-list into an allow-list for that session.
      if (value.ids !== undefined && !Array.isArray(value.ids)) {
        throw new ClipError('sessionList.ids must be an array of session ids')
      }
      for (const raw of value.ids ?? []) {
        if (coerceSessionId(raw) === null) {
          throw new ClipError(`sessionList.ids contains a value that is not a session id: ${JSON.stringify(raw)}`)
        }
      }
      next.sessionList = coerceSessionList(value)
    },
    aliases(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new ClipError('aliases must be an object of { clipId: name }')
      }
      const replacement = {}
      for (const [key, raw] of Object.entries(value)) {
        const clipId = requireKnownClip(key, 'aliases key')
        const name = coerceText(raw)
        if (name !== '') replacement[clipId] = name
      }
      next.aliases = replacement
    },
    favorites(value) {
      if (!Array.isArray(value)) throw new ClipError('favorites must be an array of ClipIds')
      if (value.length > MAX_FAVORITES) throw new ClipError(`favorites is limited to ${String(MAX_FAVORITES)} entries`)
      next.favorites = value.map((entry) => requireKnownClip(entry, 'favorites entry'))
    },
    sortMode(value) {
      if (!SORT_MODES.includes(value)) throw new ClipError(`sortMode must be one of ${SORT_MODES.join('/')}`)
      next.sortMode = value
    },
    overlayTitle(value) {
      next.overlayTitle = coerceText(value)
    },
    overlaySubtitle(value) {
      next.overlaySubtitle = coerceText(value)
    },
    watermark(value) {
      next.watermark = coerceText(value)
    },
    overlayEffect(value) {
      if (!OVERLAY_EFFECTS.includes(value)) {
        throw new ClipError(`overlayEffect must be one of ${OVERLAY_EFFECTS.join('/')}`)
      }
      next.overlayEffect = value
    },
    timeRules(value) {
      if (!Array.isArray(value)) throw new ClipError('timeRules must be an array')
      if (value.length > MAX_TIME_RULES) {
        throw new ClipError(`timeRules is limited to ${String(MAX_TIME_RULES)} entries`)
      }
      const replacement = []
      for (const [index, raw] of value.entries()) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new ClipError(`timeRules[${String(index)}] must be an object`)
        }
        const clipId = requireKnownClip(raw.clipId, `timeRules[${String(index)}].clipId`)
        replacement.push({
          id: coerceText(raw.id) || `rule-${String(index + 1)}`,
          clipId,
          label: coerceText(raw.label),
          days: coerceDays(raw.days),
          start: requireTime(raw.start, `timeRules[${String(index)}].start`),
          end: requireTime(raw.end, `timeRules[${String(index)}].end`),
          enabled: raw.enabled !== false,
        })
      }
      for (const rule of replacement) {
        if (rule.days.length === 0) rule.days = [0, 1, 2, 3, 4, 5, 6]
      }
      next.timeRules = replacement
    },
    locale(value) {
      if (!LOCALES.includes(value)) throw new ClipError(`locale must be one of ${LOCALES.join('/')}`)
      next.locale = value
    },
  }

  /**
   * Convenience operations that are not plain field assignments.
   *
   * These exist so the client never has to compute an id or a whole array in the
   * browser: `addTimeRule` is generated here, and `toggleFavorite`/`alias` are
   * read-modify-write against the file the host owns. That removes an entire
   * class of lost-update bugs between two open panels.
   */
  const operations = {
    alias(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new ClipError('alias must be { clipId, name }')
      }
      const clipId = requireKnownClip(value.clipId, 'alias.clipId')
      const name = coerceText(value.name)
      if (name === '') delete next.aliases[clipId]
      else if (Object.keys(next.aliases).length < MAX_ALIASES || clipId in next.aliases) next.aliases[clipId] = name
      else throw new ClipError(`aliases is full (${String(MAX_ALIASES)})`)
    },
    toggleFavorite(value) {
      const clipId = requireKnownClip(value, 'toggleFavorite')
      const at = next.favorites.indexOf(clipId)
      if (at === -1) {
        if (next.favorites.length >= MAX_FAVORITES) throw new ClipError(`favorites is full (${String(MAX_FAVORITES)})`)
        next.favorites.push(clipId)
      } else {
        next.favorites.splice(at, 1)
      }
    },
    sessionListOp(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new ClipError('sessionListOp must be { op, mode?, id? }')
      }
      if (value.op === 'mode') {
        if (!SESSION_LIST_MODES.includes(value.mode)) {
          throw new ClipError(`sessionListOp.mode must be one of ${SESSION_LIST_MODES.join('/')}`)
        }
        next.sessionList.mode = value.mode
        return
      }
      const id = coerceSessionId(value.id)
      if (id === null) throw new ClipError('sessionListOp.id must be a session id')
      if (value.op === 'add') {
        if (next.sessionList.ids.includes(id)) return
        if (next.sessionList.ids.length >= MAX_SESSION_IDS) throw new ClipError(`sessionList.ids is full`)
        next.sessionList.ids.push(id)
        return
      }
      if (value.op === 'remove') {
        next.sessionList.ids = next.sessionList.ids.filter((entry) => entry !== id)
        return
      }
      throw new ClipError(`sessionListOp.op must be add/remove/mode, got: ${JSON.stringify(value.op)}`)
    },
    addTimeRule(value) {
      if (next.timeRules.length >= MAX_TIME_RULES) {
        throw new ClipError(`timeRules is full (${String(MAX_TIME_RULES)})`)
      }
      const rule = buildTimeRule(value, next.timeRules.length)
      rule.clipId = requireKnownClip(rule.clipId, 'addTimeRule.clipId')
      next.timeRules.push(rule)
    },
    removeTimeRule(value) {
      const id = coerceText(value)
      const before = next.timeRules.length
      next.timeRules = next.timeRules.filter((rule) => rule.id !== id)
      if (next.timeRules.length === before) throw new ClipError(`no time rule with id: ${id}`)
    },
    setTimeRuleEnabled(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new ClipError('setTimeRuleEnabled must be { id, enabled }')
      }
      const id = coerceText(value.id)
      const rule = next.timeRules.find((entry) => entry.id === id)
      if (rule === undefined) throw new ClipError(`no time rule with id: ${id}`)
      rule.enabled = value.enabled !== false
    },
  }

  // Every key must name a setting or an operation. A typo therefore fails the
  // write instead of being dropped, which is the difference between "saved" and
  // "looked like it saved".
  const patchable = new Set([...Object.keys(setters), ...Object.keys(operations)])
  for (const key of Object.keys(patch)) {
    if (!patchable.has(key)) throw new ClipError(`selection has no field "${key}"`)
  }

  for (const [key, value] of Object.entries(patch)) {
    const setter = setters[key] ?? operations[key]
    setter(value)
  }

  return next
}
