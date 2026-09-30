/**
 * The overlay's host component: the only place the "when to play" rules are wired.
 *
 * The decision itself is `decideTrigger`, a pure function in `session.ts`. This
 * file does three things and nothing else: it keeps the small amount of browser
 * state the decision needs, applies the decision's bookkeeping, and routes every
 * play through the ONE playback entry point (`store.playMode`).
 *
 * Two orderings are load-bearing:
 *
 * 1. The catalog must be loaded before anything plays. `playClip` resolves an id
 *    through the catalog, so triggering first would play nothing — and worse,
 *    would have already recorded the session as "seen". The effect therefore does
 *    not touch `lastSessionRef` until the catalog exists, so the entry is still
 *    observed once the listing arrives.
 *
 * 2. The overlay is a Fragment, not a wrapper element. The overlay is
 *    `position:fixed`, and an extra box in the tree is exactly the kind of change
 *    that once took this overlay fully black in the real app. A Fragment adds no
 *    DOM node at all.
 */
import type { ReactElement } from 'react'
import { createElement as h, Fragment, useEffect, useRef, useState } from 'react'
import { log } from './diagnostics.js'
import {
  decideTrigger,
  hasPlayed,
  hasPlayedThisLaunch,
  markPlayed,
  markPlayedThisLaunch,
  readLastPlayedAt,
  readPinned,
  useCurrentSession,
  writeLastPlayedAt,
  type CurrentStore,
} from './session.js'
import { BootOverlay } from './ui-overlay.js'
import { VideoLibrary } from './ui-library.js'
import { useClientStore, type ClientStore } from './store.js'

/** Openers registered by mounted AppRoots. */
export const libraryOpeners = new Set<() => void>()

/** Ask whichever AppRoot is mounted to show the picker. */
export function openLibrary(): void {
  for (const open of libraryOpeners) {
    try {
      open()
    } catch {
      /* a stale subscriber must not break the pin */
    }
  }
}

export function AppRoot({ store, sessionStore }: { store: ClientStore; sessionStore: CurrentStore | null }): ReactElement {
  const snapshot = useClientStore(store)
  const { sessionId, isNewConversation } = useCurrentSession(sessionStore)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const lastSessionRef = useRef<string | null>(null)
  const catalogLoaded = snapshot.catalog !== null

  // Read the library once, then whenever the picker or a write says it changed.
  useEffect(() => {
    void store.loadCatalog()
  }, [store])

  // Register as the picker's opener. The pin lives in another slot and cannot
  // share React state with this tree, so it reaches us through this set.
  useEffect(() => {
    const handler = (): void => setLibraryOpen(true)
    libraryOpeners.add(handler)
    return () => {
      libraryOpeners.delete(handler)
    }
  }, [])

  useEffect(() => {
    if (!catalogLoaded) return

    /**
     * A conversation is not always open — DSH can start on the settings page or a
     * plugin panel. Only the startup rule can be decided without one, and
     * `decideTrigger` owns that rule rather than this effect guessing at it.
     */
    const entered = sessionId !== null && lastSessionRef.current !== sessionId
    if (sessionId !== null) lastSessionRef.current = sessionId

    // Read the settings at decision time rather than through the render closure:
    // the panel writes settings while this tree is mounted, and a change of
    // setting is not itself a reason to play anything.
    const settings = store.getSnapshot().settings
    const decision = decideTrigger({
      triggerMode: settings.triggerMode,
      pinned: sessionId !== null && readPinned() === sessionId,
      isNewConversation,
      entered,
      sessionId,
      hasPlayed: sessionId !== null && hasPlayed(sessionId),
      sessionList: settings.sessionList,
      cooldownMinutes: settings.cooldownMinutes,
      lastPlayedAt: readLastPlayedAt(),
      now: Date.now(),
      playedThisLaunch: hasPlayedThisLaunch(),
    })
    log('trigger decision', { sessionId, entered, isNewConversation, ...decision })
    if (!decision.play) return

    if (decision.reason === 'new-conversation' && sessionId !== null) markPlayed(sessionId)
    if (decision.reason === 'startup-only') markPlayedThisLaunch()
    writeLastPlayedAt(Date.now())
    void store.playMode('active', decision.reason)
  }, [catalogLoaded, sessionId, isNewConversation, store])

  return h(
    Fragment,
    null,
    h(BootOverlay, { store }),
    libraryOpen ? h(VideoLibrary, { store, sessionId, onClose: () => setLibraryOpen(false) }) : null,
  )
}
