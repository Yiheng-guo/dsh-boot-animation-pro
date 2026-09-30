/**
 * ClientStore — the client's ONE source of truth.
 *
 * The version this fork came from kept this state in four unrelated places: a
 * module-level `activeVersion` fetched once per page, a `src` frozen with
 * `useState` at overlay mount, the library's own local list, and a `fit` value
 * that lived only in localStorage. Nothing could answer "which clip is playing
 * right now", which is why selecting B could keep playing A until a reload.
 *
 * Here every one of those is one field on one object, and the three clip
 * identities are deliberately NOT the same field:
 *
 *   settings.selectedClipId      what the user chose; changes ONLY on selectClip()
 *   playback.clipId              what the <video> element is being pointed at
 *   playback.previewClipId       what the last preview asked for (may equal
 *                                neither of the others, and never persists)
 *
 * Every setting the host understands is mirrored here, and the ONLY way this
 * store changes one is by asking the host to change it and then re-reading the
 * host's answer. The client never invents a settings value: a write that the host
 * refuses leaves the panel showing what is actually on disk, which is the
 * difference between "saved" and "looked saved".
 *
 * A mutation replaces the snapshot object, so `useSyncExternalStore` sees a new
 * reference exactly when something changed — and never otherwise.
 *
 * `playback.nonce` increments on every play request. Without it, asking to play
 * the same clip twice would be a no-op for React (same clipId, same url), and a
 * replay button that does nothing is the bug this guards against.
 */
import { useSyncExternalStore } from 'react'
import { log, notify } from './diagnostics.js'
import type { Locale, MessageKey } from './i18n.js'

export type FitMode = 'cover' | 'contain'
export type TriggerMode = 'new-and-pinned' | 'new-only' | 'always' | 'startup-only' | 'off'
export type SortMode = 'default' | 'name' | 'size' | 'newest' | 'oldest'
export type OverlayEffect = 'none' | 'scanlines' | 'vignette' | 'grain' | 'glow'
export type SessionListMode = 'off' | 'allow' | 'deny'
export type PlaybackPhase = 'idle' | 'loading' | 'playing' | 'stalled' | 'error'

/**
 * The enumerations the panel renders, as the client knows them.
 *
 * These are mirrored in `src/host/settings.js`. Duplicating them buys typed
 * rendering in the panel; `scripts/verify-settings.mjs` compares the two lists and
 * fails the build's check command if they ever drift.
 */
export const FIT_MODES = ['cover', 'contain'] as const
export const TRIGGER_MODES = ['new-and-pinned', 'new-only', 'always', 'startup-only', 'off'] as const
export const SORT_MODES = ['default', 'name', 'size', 'newest', 'oldest'] as const
export const OVERLAY_EFFECTS = ['none', 'scanlines', 'vignette', 'grain', 'glow'] as const
export const LOCALES = ['auto', 'zh', 'en'] as const
export const SESSION_LIST_MODES = ['off', 'allow', 'deny'] as const

/** The bounds the sliders and number inputs use, matching the host's clamps. */
export const VOLUME_RANGE = [0, 1] as const
export const RATE_RANGE = [0.25, 2] as const
export const AUTO_SKIP_RANGE = [0, 60] as const
export const COOLDOWN_RANGE = [0, 1440] as const
export const FADE_RANGE = [0, 3000] as const

/** One clip as the host lists it. */
export type ClipInfo = {
  id: string
  name: string
  /** The name derived from the file, before any alias. */
  originalName?: string
  renamed?: boolean
  file: string | null
  ext: string
  source: string
  kind?: string
  writable?: boolean
  /** Whether `POST /remove` would really delete this row's file. */
  removable?: boolean
  favorite?: boolean
  embedded?: string | null
  bytes: number
  mtime?: string | null
  legacy?: boolean
  faststart?: boolean
  version?: string | null
  mediaUrl?: string
  copies?: number
  alsoAt?: string[]
  active?: boolean
  selected?: boolean
}

/** One `play this clip during these hours` rule, exactly as the host stores it. */
export type TimeRule = {
  id: string
  clipId: string
  label: string
  days: number[]
  start: string
  end: string
  enabled: boolean
}

export type Catalog = {
  clips: ClipInfo[]
  userDir: string
  accepts: string[]
}

export type Settings = {
  version: number
  selectedClipId: string | null
  randomPlayback: boolean
  fitMode: FitMode
  volume: number
  muted: boolean
  playbackRate: number
  showProgress: boolean
  autoSkipSeconds: number
  fadeOutMs: number
  triggerMode: TriggerMode
  cooldownMinutes: number
  sessionList: { mode: SessionListMode; ids: string[] }
  aliases: Record<string, string>
  favorites: string[]
  sortMode: SortMode
  overlayTitle: string
  overlaySubtitle: string
  watermark: string
  overlayEffect: OverlayEffect
  timeRules: TimeRule[]
  locale: Locale
}

export type Playback = {
  clipId: string | null
  previewClipId: string | null
  url: string | null
  phase: PlaybackPhase
  reason: string
  nonce: number
  message: MessageKey | null
}

/** The status line under the panel: a message key, never a pre-rendered sentence. */
export type Status = {
  key: MessageKey | null
  params: Record<string, string | number>
  kind: '' | 'dbap-ok' | 'dbap-err'
}

export type Snapshot = {
  catalog: Catalog | null
  settings: Settings
  playback: Playback
  loading: boolean
  busy: boolean
  status: Status
}

const BASE = '/dsh-boot-animation-pro'
const LIST_URL = `${BASE}/videos.json`
const SELECT_URL = `${BASE}/select`
const REMOVE_URL = `${BASE}/remove`
const RESOLVE_URL = `${BASE}/resolve.json`

/** The client's defaults. Spelled out so a missing host field has a real value. */
export const DEFAULT_SETTINGS: Settings = {
  version: 3,
  selectedClipId: null,
  randomPlayback: false,
  fitMode: 'cover',
  volume: 1,
  muted: true,
  playbackRate: 1,
  showProgress: true,
  autoSkipSeconds: 0,
  fadeOutMs: 400,
  triggerMode: 'new-and-pinned',
  cooldownMinutes: 0,
  sessionList: { mode: 'off', ids: [] },
  aliases: {},
  favorites: [],
  sortMode: 'default',
  overlayTitle: '',
  overlaySubtitle: '',
  watermark: '',
  overlayEffect: 'none',
  timeRules: [],
  locale: 'auto',
}

const IDLE_PLAYBACK: Playback = {
  clipId: null,
  previewClipId: null,
  url: null,
  phase: 'idle',
  reason: 'none',
  nonce: 0,
  message: null,
}

const EMPTY_STATUS: Status = { key: null, params: {}, kind: '' }

// ------------------------------------------------------------------ coercion

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback: number, [min, max]: readonly [number, number]): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function asTimeRules(value: unknown): TimeRule[] {
  if (!Array.isArray(value)) return []
  const rules: TimeRule[] = []
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object') continue
    const rule = raw as Record<string, unknown>
    if (typeof rule.id !== 'string' || typeof rule.clipId !== 'string') continue
    if (typeof rule.start !== 'string' || typeof rule.end !== 'string') continue
    rules.push({
      id: rule.id,
      clipId: rule.clipId,
      label: asText(rule.label),
      days: Array.isArray(rule.days) ? rule.days.filter((day): day is number => typeof day === 'number') : [],
      start: rule.start,
      end: rule.end,
      enabled: rule.enabled !== false,
    })
  }
  return rules
}

/**
 * A settings object from whatever the host sent.
 *
 * This is a WIRE boundary, so it validates rather than trusting the static type:
 * the payload is JSON from an HTTP response, and a field the host added later
 * must not be able to put a `NaN` into a slider.
 */
export function normaliseSettings(raw: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...fallback }
  const source = raw as Record<string, unknown>
  const list = source.sessionList
  const sessionList = list !== null && typeof list === 'object' && !Array.isArray(list) ? (list as Record<string, unknown>) : {}
  return {
    version: typeof source.version === 'number' ? source.version : fallback.version,
    selectedClipId: typeof source.selectedClipId === 'string' ? source.selectedClipId : null,
    randomPlayback: asBoolean(source.randomPlayback, fallback.randomPlayback),
    fitMode: asEnum(source.fitMode, FIT_MODES, fallback.fitMode),
    volume: asNumber(source.volume, fallback.volume, VOLUME_RANGE),
    muted: asBoolean(source.muted, fallback.muted),
    playbackRate: asNumber(source.playbackRate, fallback.playbackRate, RATE_RANGE),
    showProgress: asBoolean(source.showProgress, fallback.showProgress),
    autoSkipSeconds: asNumber(source.autoSkipSeconds, fallback.autoSkipSeconds, AUTO_SKIP_RANGE),
    fadeOutMs: asNumber(source.fadeOutMs, fallback.fadeOutMs, FADE_RANGE),
    triggerMode: asEnum(source.triggerMode, TRIGGER_MODES, fallback.triggerMode),
    cooldownMinutes: asNumber(source.cooldownMinutes, fallback.cooldownMinutes, COOLDOWN_RANGE),
    sessionList: {
      mode: asEnum(sessionList.mode, SESSION_LIST_MODES, fallback.sessionList.mode),
      ids: asStringList(sessionList.ids),
    },
    aliases:
      source.aliases !== null && typeof source.aliases === 'object' && !Array.isArray(source.aliases)
        ? Object.fromEntries(
            Object.entries(source.aliases as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : {},
    favorites: asStringList(source.favorites),
    sortMode: asEnum(source.sortMode, SORT_MODES, fallback.sortMode),
    overlayTitle: asText(source.overlayTitle),
    overlaySubtitle: asText(source.overlaySubtitle),
    watermark: asText(source.watermark),
    overlayEffect: asEnum(source.overlayEffect, OVERLAY_EFFECTS, fallback.overlayEffect),
    timeRules: asTimeRules(source.timeRules),
    locale: asEnum(source.locale, LOCALES, fallback.locale),
  }
}

// ---------------------------------------------------------------------- store

/**
 * The media URL for one clip.
 *
 * Addressed by ClipId, with the clip's own content identity pinned as `?v=`.
 * That is what makes "select A, then B, then C" deterministic without a reload:
 * every clip is a different resource, so nothing can be served from the previous
 * clip's cache entry, and a pinned URL is immutable because it cannot go stale.
 */
export function mediaUrlFor(clip: ClipInfo): string {
  const path = clip.mediaUrl ?? `${BASE}/media/${encodeURIComponent(clip.id)}`
  const version = clip.version
  return typeof version === 'string' && version !== '' ? `${path}?v=${encodeURIComponent(version)}` : path
}

/** Everything `POST /select` can change, as the panel spells it. */
export type SettingsPatch = Partial<Omit<Settings, 'version'>> & {
  alias?: { clipId: string; name: string }
  toggleFavorite?: string
  sessionListOp?: { op: 'add' | 'remove' | 'mode'; id?: string; mode?: SessionListMode }
  addTimeRule?: { clipId: string; days: number[]; start: string; end: string; label?: string }
  removeTimeRule?: string
  setTimeRuleEnabled?: { id: string; enabled: boolean }
}

export class ClientStore {
  #snapshot: Snapshot = {
    catalog: null,
    settings: { ...DEFAULT_SETTINGS },
    playback: IDLE_PLAYBACK,
    loading: false,
    busy: false,
    status: EMPTY_STATUS,
  }

  #listeners = new Set<() => void>()

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  getSnapshot = (): Snapshot => this.#snapshot

  #set(patch: Partial<Snapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch }
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch {
        /* one broken subscriber must not stop the others */
      }
    }
  }

  /** Read the library and the settings from the host. Safe to call repeatedly. */
  async loadCatalog(): Promise<void> {
    this.#set({ loading: true })
    try {
      const response = await fetch(LIST_URL, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
      const data = (await response.json()) as Record<string, unknown>
      /**
       * The host sends the whole settings object under `settings`. The three flat
       * fields beside it are the pre-1.0 wire format, kept readable so a stub or
       * an older host still yields a complete settings object instead of defaults.
       */
      const flat: Record<string, unknown> = {
        selectedClipId: data.selectedClipId,
        randomPlayback: data.randomPlayback,
        fitMode: data.fitMode,
      }
      const settings = normaliseSettings(data.settings ?? flat, this.#snapshot.settings)
      this.#set({
        catalog: {
          clips: Array.isArray(data.videos) ? (data.videos as ClipInfo[]) : [],
          userDir: typeof data.userDir === 'string' ? data.userDir : '',
          accepts: Array.isArray(data.accepts) ? (data.accepts as string[]) : [],
        },
        settings,
        loading: false,
        status: EMPTY_STATUS,
      })
      log('catalog loaded', { clips: (data.videos as unknown[] | undefined)?.length ?? 0 })
    } catch (error) {
      notify('catalog load failed', String(error))
      this.#set({ loading: false, status: { key: 'status.catalogFailed', params: { error: String(error) }, kind: 'dbap-err' } })
    }
  }

  /**
   * Save one patch and adopt the host's answer.
   *
   * THE only write path. Everything the panel can change goes through here, so
   * there is exactly one place that decides what "the settings are now" means,
   * and it is the host's reply rather than the browser's optimism.
   *
   * @param patch the `POST /select` body
   * @param okKey the status message shown when the host accepts
   */
  async save(patch: SettingsPatch, okKey: MessageKey, okParams: Record<string, string | number> = {}): Promise<boolean> {
    this.#set({ busy: true, status: { key: 'status.busy', params: {}, kind: '' } })
    try {
      const response = await fetch(SELECT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await response.json()) as Record<string, unknown>
      if (data.ok !== true) {
        this.#set({
          busy: false,
          status: { key: 'status.saveFailed', params: { error: String(data.error ?? '') }, kind: 'dbap-err' },
        })
        return false
      }
      this.#set({
        busy: false,
        settings: normaliseSettings(data.settings, this.#snapshot.settings),
        status: { key: okKey, params: okParams, kind: 'dbap-ok' },
      })
      // The row list itself may have changed (a rename, a favourite, a new rule),
      // and the host is the only party that knows the new order.
      await this.loadCatalog()
      this.#set({ status: { key: okKey, params: okParams, kind: 'dbap-ok' } })
      return true
    } catch (error) {
      this.#set({ busy: false, status: { key: 'status.saveFailed', params: { error: String(error) }, kind: 'dbap-err' } })
      return false
    }
  }

  /** Choose a clip. The ONLY method that changes `settings.selectedClipId`. */
  async selectClip(clipId: string): Promise<boolean> {
    const clip = this.clip(clipId)
    return this.save({ selectedClipId: clipId }, 'status.selected', { name: clip?.name ?? clipId })
  }

  async setRandomPlayback(on: boolean): Promise<boolean> {
    return this.save({ randomPlayback: on }, on ? 'status.randomOn' : 'status.randomOff')
  }

  async setFitMode(mode: FitMode): Promise<boolean> {
    return this.save({ fitMode: mode }, mode === 'cover' ? 'status.fitCover' : 'status.fitContain')
  }

  /** Rename one row. An empty name restores the name derived from the file. */
  async renameClip(clipId: string, name: string): Promise<boolean> {
    const trimmed = name.trim()
    return this.save(
      { alias: { clipId, name: trimmed } },
      trimmed === '' ? 'status.renameCleared' : 'status.renamed',
      { name: trimmed },
    )
  }

  async toggleFavorite(clipId: string): Promise<boolean> {
    const on = !(this.clip(clipId)?.favorite ?? false)
    return this.save({ toggleFavorite: clipId }, on ? 'status.favoriteOn' : 'status.favoriteOff')
  }

  /**
   * Delete one of the user's own files.
   *
   * Deliberately a separate route from `/select`: this is the only call in the
   * plugin that destroys something the user made, so it gets its own endpoint and
   * its own failure message instead of travelling as one more settings patch.
   */
  async removeClip(clipId: string): Promise<boolean> {
    const clip = this.clip(clipId)
    this.#set({ busy: true, status: { key: 'status.busy', params: {}, kind: '' } })
    try {
      const response = await fetch(REMOVE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clipId }),
      })
      const data = (await response.json()) as Record<string, unknown>
      if (data.ok !== true) {
        this.#set({
          busy: false,
          status: { key: 'status.removeFailed', params: { error: String(data.error ?? '') }, kind: 'dbap-err' },
        })
        return false
      }
      await this.loadCatalog()
      this.#set({ busy: false, status: { key: 'status.removed', params: { name: clip?.name ?? clipId }, kind: 'dbap-ok' } })
      return true
    } catch (error) {
      this.#set({ busy: false, status: { key: 'status.removeFailed', params: { error: String(error) }, kind: 'dbap-err' } })
      return false
    }
  }

  /** One clip from the loaded catalog. */
  clip(clipId: string): ClipInfo | null {
    const catalog = this.#snapshot.catalog
    if (catalog === null) return null
    return catalog.clips.find((item) => item.id === clipId) ?? null
  }

  setStatus(key: MessageKey, kind: Status['kind'], params: Record<string, string | number> = {}): void {
    this.#set({ status: { key, params, kind } })
  }

  /** The language the panel renders in, given the stored preference. */
  localeSetting(): Locale {
    return this.#snapshot.settings.locale
  }

  /**
   * Point the player at one clip. THE playback entry point.
   *
   * `reason` is recorded so diagnostics can say why this clip is playing
   * ('preview', 'new-conversation', 'pinned', 'random', 'schedule'), and every
   * caller — preview, new conversation, pinned session, schedule, random —
   * arrives here.
   */
  playClip(clipId: string, reason: string): boolean {
    const clip = this.clip(clipId)
    if (clip === null) {
      notify('play requested for an unknown clip', { clipId, reason })
      return false
    }
    const playback = this.#snapshot.playback
    this.#set({
      playback: {
        ...playback,
        clipId,
        url: mediaUrlFor(clip),
        phase: 'loading',
        reason,
        nonce: playback.nonce + 1,
        message: null,
      },
    })
    notify('play', { clipId, reason, url: mediaUrlFor(clip) })
    return true
  }

  /**
   * Ask the host which clip should play in a given mode, then play it.
   *
   * The client never decides this itself: `selected`, `active` (which honours
   * time rules, then random playback) and `random` are all answered by the host's
   * ClipResolver, so there is exactly one implementation of the priority chain
   * and one of the "do not repeat" rule. If the host cannot be reached, this
   * degrades to whatever the catalog already knows rather than failing.
   */
  async playMode(mode: 'active' | 'random' | 'selected' | 'schedule', reason: string): Promise<boolean> {
    try {
      const response = await fetch(`${RESOLVE_URL}?mode=${mode}`, { cache: 'no-store' })
      if (response.ok) {
        const data = (await response.json()) as { clipId?: string | null; how?: string }
        if (typeof data.clipId === 'string' && data.clipId !== '') {
          const how = typeof data.how === 'string' ? data.how : ''
          /**
           * The caller's reason wins, because it knows the trigger ("a pinned
           * conversation was opened") while the host only knows the mode ("the
           * stored selection"). A time-rule hit is the exception: it is a fact
           * about the clip that the caller cannot see.
           */
          const effective = how === 'schedule' ? 'schedule' : reason !== '' ? reason : how === '' ? 'active' : how
          return this.playClip(data.clipId, effective)
        }
      }
      notify('resolve fell back to the catalog', { mode })
    } catch (error) {
      notify('resolve failed', String(error))
    }
    const settings = this.#snapshot.settings
    if (settings.randomPlayback) {
      const pool = this.#snapshot.catalog?.clips ?? []
      if (pool.length > 0) return this.playClip(pool[0].id, 'fallback')
      return false
    }
    if (settings.selectedClipId !== null) return this.playClip(settings.selectedClipId, 'fallback')
    return false
  }

  /**
   * Preview one specific clip.
   *
   * Records `previewClipId` so the UI can mark what is being auditioned, and
   * plays it — without touching the selection. Previewing B while A is selected
   * must show B and leave A selected.
   */
  preview(clipId: string, reason = 'preview'): boolean {
    const played = this.playClip(clipId, reason)
    if (played) {
      this.#set({ playback: { ...this.#snapshot.playback, previewClipId: clipId } })
    }
    return played
  }

  /** Report the phase the <video> element reached. */
  setPhase(phase: PlaybackPhase, message: MessageKey | null = null): void {
    if (this.#snapshot.playback.phase === phase && this.#snapshot.playback.message === message) return
    this.#set({ playback: { ...this.#snapshot.playback, phase, message } })
  }

  /** Stop playback (overlay closed, ended, or skipped). */
  stop(): void {
    const playback = this.#snapshot.playback
    if (playback.phase === 'idle' && playback.clipId === null) return
    this.#set({ playback: { ...playback, phase: 'idle', clipId: null, url: null, message: null } })
  }
}

/** The store as React sees it, without the component that used to own it. */
export function useClientStore(store: ClientStore): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
