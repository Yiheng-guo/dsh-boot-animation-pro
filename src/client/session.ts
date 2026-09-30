/**
 * Session binding and the trigger rules.
 *
 * Two pieces of hard-won knowledge live here and must not be lost:
 *
 * 1. `hooks.session` is a `SessionFace` — `ISession & ObservableSnapshot<SessionSnapshot>`
 *    (see `@deepseek-ai/dsh-api-session-controller`) — so "this conversation has
 *    no turns yet" is `getSnapshot().blank`. Before DSH 0.2.0 the flag was a
 *    `blankBit` field directly on the binding. Reading the field that is no
 *    longer there does not throw, it answers `undefined`, so the failure was
 *    silence: auto-play simply stopped happening. Both shapes are read, and the
 *    face is SUBSCRIBED to rather than sampled once, because the flag arrives on
 *    a nested snapshot that can settle after the binding changes.
 *
 * 2. Both the pin and the "already played" record are per session, keyed by
 *    session id, and both live in localStorage. They are client concerns: the
 *    host never learns a session id from this plugin.
 *
 * Everything from "when should the intro play" upwards is `decideTrigger`, a PURE
 * function of the settings, the clock and three small pieces of browser state.
 * That is deliberate: the rule set grew from one behaviour to five plus a
 * cooldown plus a session allow/deny list, and a rule engine that can only be
 * tested by driving React is a rule engine that will be wrong.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { log } from './diagnostics.js'
import type { SessionListMode, TriggerMode } from './store.js'

/** The part of a `SessionFace` this plugin reads. */
export type SessionFaceLike = {
  getSnapshot?: () => { blank?: unknown; sessionId?: unknown } | null | undefined
  subscribe?: (onChange: () => void) => unknown
  blankBit?: unknown
}

/** The resolved ui-session binding as the built-in source publishes it. */
export type Binding = {
  key?: unknown
  hooks?: { session?: SessionFaceLike }
  keyedHooks?: unknown
  props?: { sessionId?: unknown }
}

/** The `adapter.current` store, as far as this plugin needs it. */
export type CurrentStore = {
  subscribe: (onChange: () => void) => () => void
  getSnapshot: () => unknown
}

/**
 * True when the current conversation still has no turns, from whichever shape
 * the running host exposes.
 *
 * Exported so `scripts/verify-blank.mjs` can exercise THIS shipped function
 * rather than a copy of it. The bug it guards against is a silent one — a field
 * that moved answers `undefined` instead of throwing — so a test that only
 * checked "the bundle built" would not have caught it.
 */
export function isBlankSession(session: SessionFaceLike | undefined): boolean {
  if (session === null || session === undefined) return false
  if (typeof session.getSnapshot === 'function') {
    try {
      const snapshot = session.getSnapshot()
      // Trust the snapshot only when the key is actually present: a pre-0.2.0
      // face may not carry it, and an `undefined` there must not shadow the
      // legacy field.
      if (snapshot !== null && typeof snapshot === 'object' && 'blank' in snapshot) {
        return snapshot.blank === true
      }
    } catch {
      /* a face that throws on read falls through to the legacy field */
    }
  }
  return session.blankBit === true
}

/**
 * Resolve the current Session identity across the host shapes this plugin supports.
 *
 * Reading only `props.sessionId` does not throw on a host that moved the
 * identity — it answers `undefined`, so the per-session "already played" record
 * and the pin silently stopped matching. The modern Session face carries
 * `sessionId` in its snapshot; ui-session's current adapter also publishes the
 * same identity as `binding.key`; the old prop stays last as a compatibility
 * fallback.
 *
 * Exported so `scripts/verify-session-id.mjs` exercises THIS shipped function.
 */
export function resolveSessionId(binding: Binding | null | undefined): string | null {
  const session = binding?.hooks?.session
  let snapshot: unknown = null
  try {
    if (session !== undefined && typeof session.getSnapshot === 'function') {
      snapshot = session.getSnapshot()
    }
  } catch {
    /* a face that throws on read falls through to the other published shapes */
  }

  const candidate =
    (snapshot !== null && typeof snapshot === 'object' && 'sessionId' in snapshot
      ? (snapshot as { sessionId?: unknown }).sessionId
      : undefined) ??
    (typeof binding?.key === 'string' ? binding.key : undefined) ??
    (typeof binding?.props?.sessionId === 'string' ? binding.props.sessionId : undefined)

  return typeof candidate === 'string' && candidate !== '' ? candidate : null
}

const noopSubscribe = () => () => {}

/** Subscribe to the current-conversation store, tolerating its absence. */
export function useCurrentSession(store: CurrentStore | null): {
  sessionId: string | null
  isNewConversation: boolean
} {
  const binding = useSyncExternalStore(
    store === null ? noopSubscribe : store.subscribe,
    store === null ? () => null : store.getSnapshot,
  ) as Binding | null

  const session = binding?.hooks?.session

  // The face is itself an observable, so subscribe to it rather than sampling it
  // once. A session is created blank and its snapshot can settle after the
  // binding changes; judging it only on the render that changed `sessionId` made
  // auto-play depend on which of two stores happened to settle first.
  const subscribeBlank = useCallback(
    (onChange: () => void): (() => void) => {
      if (session === undefined || typeof session.subscribe !== 'function') return () => {}
      const stop = session.subscribe(onChange)
      return typeof stop === 'function' ? (stop as () => void) : () => {}
    },
    [session],
  )
  const isNewConversation = useSyncExternalStore(subscribeBlank, () => isBlankSession(session))

  const sessionId = resolveSessionId(binding)
  return { sessionId, isNewConversation }
}

// ------------------------------------------------------------ browser state

const SEEN_KEY = 'dsh-boot-animation-pro:played'
const PIN_KEY = 'dsh-boot-animation-pro:pinned'
const PLAYED_AT_KEY = 'dsh-boot-animation-pro:played-at'
const MAX_SEEN = 80

/** localStorage, or null where it is unavailable (private mode, a bare test). */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []
  } catch {
    return []
  }
}

export function hasPlayed(sessionId: string): boolean {
  return readSeen().includes(sessionId)
}

export function markPlayed(sessionId: string): void {
  try {
    const seen = readSeen()
    if (!seen.includes(sessionId)) seen.push(sessionId)
    while (seen.length > MAX_SEEN) seen.shift()
    storage()?.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    /* private mode: it simply replays next time */
  }
}

export function readPinned(): string | null {
  try {
    const value = storage()?.getItem(PIN_KEY) ?? null
    return value === null || value === '' ? null : value
  } catch {
    return null
  }
}

export function writePinned(sessionId: string | null): void {
  try {
    if (sessionId === null) storage()?.removeItem(PIN_KEY)
    else storage()?.setItem(PIN_KEY, sessionId)
  } catch {
    /* private mode: the pin simply does not persist */
  }
  log('pin written', { sessionId })
}

/**
 * When an intro last played, as epoch milliseconds, or null.
 *
 * The cooldown needs a time, and it must survive a reload — otherwise "do not
 * disturb me twice in ten minutes" would reset every time the page is refreshed,
 * which is exactly when it is most annoying.
 */
export function readLastPlayedAt(): number | null {
  try {
    const raw = storage()?.getItem(PLAYED_AT_KEY) ?? null
    if (raw === null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

export function writeLastPlayedAt(epochMs: number): void {
  try {
    storage()?.setItem(PLAYED_AT_KEY, String(epochMs))
  } catch {
    /* private mode: the cooldown becomes per-page */
  }
}

/**
 * Whether "once per DSH start" has already been spent.
 *
 * A module-level flag, not storage: one page load IS one start, so a reload must
 * reset it and a second tab must not consume the other tab's turn.
 */
let playedThisLaunch = false

export function hasPlayedThisLaunch(): boolean {
  return playedThisLaunch
}

export function markPlayedThisLaunch(): void {
  playedThisLaunch = true
}

/** Test seam: forget the launch flag. */
export function resetLaunchFlag(): void {
  playedThisLaunch = false
}

// ------------------------------------------------------------- trigger rules

/** Everything `decideTrigger` needs. Nothing here is read from a global. */
export type TriggerInput = {
  triggerMode: TriggerMode
  pinned: boolean
  isNewConversation: boolean
  /** The session id changed since the previous render. */
  entered: boolean
  sessionId: string | null
  hasPlayed: boolean
  sessionList: { mode: SessionListMode; ids: string[] }
  cooldownMinutes: number
  lastPlayedAt: number | null
  now: number
  playedThisLaunch: boolean
}

export type TriggerDecision = {
  play: boolean
  /** The playback reason recorded on the overlay, when `play` is true. */
  reason: string
  /** Why it did or did not play, for the debug log. Never user-facing. */
  why: string
}

/**
 * The complete answer to "should the intro play right now".
 *
 * Order matters and is the contract:
 *
 *   1. mode `off`                → nothing plays, whatever else is true
 *   2. no session                → nothing to attach a rule to, EXCEPT startup
 *   3. session allow/deny list   → a veto, whatever the mode says
 *   4. cooldown                  → a veto, whatever the mode says
 *   5. the mode itself
 *
 * The list and the cooldown are vetoes rather than modes on purpose: they answer
 * "not this time", which composes with every mode, instead of being a sixth thing
 * the mode has to consider.
 *
 * `startup-only` is deliberately decided BEFORE the session gate. It is the one
 * rule about the APP rather than about a conversation, and a conversation is not
 * always open — DSH can be sitting on the settings page or a plugin panel when it
 * starts. Requiring a session there made "play once every time I open DSH" fail
 * silently in exactly that case, which is the kind of failure this file exists to
 * prevent. The session list cannot apply without a session, so it is skipped.
 *
 * @param input
 * @returns the decision; `reason` is only meaningful when `play` is true
 */
export function decideTrigger(input: TriggerInput): TriggerDecision {
  const no = (why: string): TriggerDecision => ({ play: false, reason: '', why })

  if (input.triggerMode === 'off') return no('triggerMode is off')

  const startupOnly = input.triggerMode === 'startup-only'
  if (input.sessionId === null && !startupOnly) return no('no current session')

  // Without a session there is nothing to look up, so the list is inert rather
  // than an allow-list that matches nothing.
  if (input.sessionId !== null) {
    const listed = input.sessionList.ids.includes(input.sessionId)
    if (input.sessionList.mode === 'allow' && !listed) return no('session is not on the allow list')
    if (input.sessionList.mode === 'deny' && listed) return no('session is on the deny list')
  }

  if (input.cooldownMinutes > 0 && input.lastPlayedAt !== null) {
    const elapsed = input.now - input.lastPlayedAt
    if (elapsed >= 0 && elapsed < input.cooldownMinutes * 60000) {
      return no(`cooldown: ${String(Math.round(elapsed / 1000))}s of ${String(input.cooldownMinutes * 60)}s elapsed`)
    }
  }

  switch (input.triggerMode) {
    case 'startup-only':
      return input.playedThisLaunch ? no('already played in this launch') : { play: true, reason: 'startup-only', why: 'first play of this launch' }
    case 'always':
      return input.entered ? { play: true, reason: 'always', why: 'a conversation was entered' } : no('same conversation, no entry')
    case 'new-only':
      return input.isNewConversation && !input.hasPlayed
        ? { play: true, reason: 'new-conversation', why: 'a new conversation' }
        : no('not an unseen new conversation')
    case 'new-and-pinned':
      if (input.pinned) {
        return input.entered ? { play: true, reason: 'pinned', why: 'the pinned conversation was entered' } : no('pinned, but not re-entered')
      }
      return input.isNewConversation && !input.hasPlayed
        ? { play: true, reason: 'new-conversation', why: 'a new conversation' }
        : no('not pinned, and not an unseen new conversation')
    default:
      return no(`unhandled triggerMode: ${String(input.triggerMode)}`)
  }
}
