/**
 * The playback surface: one <video> element, and everything drawn over it.
 *
 * Rules that are not negotiable, because each one is a defect that shipped:
 *
 * 1. THE OVERLAY PLAYS `playback.url` FROM THE STORE. An earlier version froze a
 *    single shared URL at mount (`useState(videoSrc)`), so a switch could not
 *    reach it and every clip played through `boot.mp4` — "whatever is active".
 *    Now the URL identifies one clip, and a change to it re-points the element.
 *
 * 2. THE VIDEO'S OWN CLICK HANDLER ACTIVATES, it does not swallow the event.
 *    The root used to be the only click target for "click for sound · full
 *    screen", while the video — which fills the root in `cover` mode — called
 *    `stopPropagation()`. The advertised interaction therefore did nothing in the
 *    one mode that is on by default. Both surfaces now activate.
 *
 * 3. COMPONENTS ARE RENDERED AS ELEMENTS, never called as plain functions.
 *    Calling one runs its hooks against the parent's hook list, so opening the
 *    picker changed the hook count and React threw "Rendered more hooks than
 *    during the previous render".
 */
import type { ReactElement } from 'react'
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { log, notify } from './diagnostics.js'
import { resolveLocale, translatorFor } from './i18n.js'
import type { MessageKey } from './i18n.js'
import { useClientStore, type ClientStore, type OverlayEffect } from './store.js'
import { ensureStyle } from './styles.js'

/** How long a play attempt may show black before the overlay gives up. */
const STALL_TIMEOUT_MS = 25000
/** How long an error stays readable before the overlay closes itself. */
const ERROR_LINGER_MS = 8000

/** Keys that dismiss the overlay, by `KeyboardEvent.key`. */
const SKIP_KEYS = new Set(['Escape', ' ', 'Spacebar', 'Enter'])

/**
 * Whether the overlay listens for skip keys right now.
 *
 * The picker is a separate React root over the same window, so it cannot stop the
 * overlay's listener by ordering. It flips this flag instead while it is open,
 * which is what keeps Escape from meaning "close the dialog" AND "skip the video"
 * at the same time.
 */
let skipKeysEnabled = true

/** Turn the overlay's keyboard shortcuts on or off. */
export function setSkipKeysEnabled(enabled: boolean): void {
  skipKeysEnabled = enabled
}

/**
 * Stop a media element completely when the overlay leaves the tree.
 *
 * Detaching a <video> from the DOM does not stop it: HMR, disabling the plugin,
 * or a slot remount all unmount the overlay while the element keeps playing and
 * holding a decoder. `load()` aborts the pending media fetch and releases the
 * decoder.
 *
 * Exported so `scripts/verify-teardown.mjs` exercises THIS shipped function.
 */
export function releaseVideo(video: HTMLVideoElement): void {
  try {
    video.pause()
    video.currentTime = 0
    video.removeAttribute('src')
    video.load()
  } catch {
    /* a detached media element can throw here; nothing remains to clean up */
  }
}

/** The decorative class for one effect, or null for "none". */
export function effectClass(effect: OverlayEffect): string | null {
  return effect === 'none' ? null : `dbap-fx-${effect}`
}

export function BootOverlay({ store }: { store: ClientStore }): ReactElement | null {
  ensureStyle()
  const snapshot = useClientStore(store)
  const { url, nonce, phase, clipId, reason, previewClipId } = snapshot.playback
  const settings = snapshot.settings
  const t = useMemo(() => translatorFor(resolveLocale(settings.locale)), [settings.locale])
  const [needsTap, setNeedsTap] = useState(false)
  const [progress, setProgress] = useState(0)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [fading, setFading] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const closedRef = useRef(false)

  const close = useCallback(() => {
    closedRef.current = true
    const video = videoRef.current
    if (video !== null) {
      try {
        video.pause()
      } catch {
        /* already stopped */
      }
    }
    if (document.fullscreenElement !== null && document.exitFullscreen !== undefined) {
      document.exitFullscreen().catch(() => {})
    }
    store.stop()
  }, [store])

  /** The close that a fade-out uses: hold the last frame, then leave. */
  const finishWithFade = useCallback(() => {
    if (closedRef.current) return
    if (settings.fadeOutMs <= 0) {
      close()
      return
    }
    setFading(true)
    window.setTimeout(() => {
      if (!closedRef.current) close()
    }, settings.fadeOutMs)
  }, [close, settings.fadeOutMs])

  useEffect(() => {
    if (url === null) return undefined
    const video = videoRef.current
    if (video === null) return undefined
    closedRef.current = false
    setNeedsTap(false)
    setProgress(0)
    setFading(false)
    setRemaining(settings.autoSkipSeconds > 0 ? settings.autoSkipSeconds : null)

    // Autoplay policy: a browser will only start a muted element by itself, so the
    // first attempt is always muted and the first click turns the sound on.
    video.muted = true
    video.volume = Math.min(1, Math.max(0, settings.volume))
    video.playbackRate = Math.min(2, Math.max(0.25, settings.playbackRate))

    const startedAt = performance.now()
    /** One line carrying everything a black-frame report needs. */
    const report = (label: string): void =>
      notify(label, {
        ms: Math.round(performance.now() - startedAt),
        clipId,
        reason,
        readyState: video.readyState,
        networkState: video.networkState,
        src: video.currentSrc || video.src,
      })

    const onPlaying = (): void => {
      store.setPhase('playing')
      report('first frame painted')
    }
    const onTimeUpdate = (): void => {
      const total = video.duration
      setProgress(Number.isFinite(total) && total > 0 ? Math.min(1, video.currentTime / total) : 0)
    }
    const onEnded = (): void => {
      finishWithFade()
    }
    video.addEventListener('playing', onPlaying)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('ended', onEnded)

    // Point the element at THIS clip's resource and force a fresh load. The URL
    // names one clip, so the previous clip's cached ranges cannot be spliced in.
    video.src = url
    video.load()
    const attempt = video.play()
    if (attempt !== undefined && typeof attempt.then === 'function') {
      attempt.then(() => log('play started', { clipId })).catch((error: unknown) => {
        log('play rejected', String(error))
        setNeedsTap(true)
      })
    }

    const guard = window.setTimeout(() => {
      if (!closedRef.current) {
        // Report BEFORE closing: a silent close leaves nothing to diagnose.
        store.setPhase('stalled', 'overlay.stalled')
        report('stalled, giving up after ' + String(STALL_TIMEOUT_MS) + 'ms')
        close()
      }
    }, STALL_TIMEOUT_MS)

    return () => {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('ended', onEnded)
      window.clearTimeout(guard)
      // Unmount is another way the overlay disappears (HMR, plugin disable,
      // slot remount). Detaching a <video> does not stop media by itself.
      releaseVideo(video)
    }
  }, [url, nonce, clipId, reason, store, close, finishWithFade, settings.volume, settings.playbackRate, settings.autoSkipSeconds])

  /** The countdown, which is a display concern only: `close` is what ends it. */
  useEffect(() => {
    if (remaining === null || url === null) return undefined
    if (remaining <= 0) {
      close()
      return undefined
    }
    const timer = window.setTimeout(() => setRemaining(remaining - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [remaining, url, close])

  /** Keyboard skip, disabled while the picker owns the keyboard. */
  useEffect(() => {
    if (url === null) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (!skipKeysEnabled) return
      if (!SKIP_KEYS.has(event.key)) return
      const active = document.activeElement
      const tag = active === null ? '' : active.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [url, close])

  if (url === null || phase === 'idle') return null

  const activate = (): void => {
    const video = videoRef.current
    if (video === null) return
    if (needsTap) {
      setNeedsTap(false)
      video.muted = false
      const attempt = video.play()
      if (attempt !== undefined && typeof attempt.catch === 'function') attempt.catch(() => {})
    } else if (video.muted) {
      video.muted = false
    }
    if (document.fullscreenElement === null && typeof video.requestFullscreen === 'function') {
      video.requestFullscreen().catch(() => {})
    }
  }

  const clip = clipId === null ? null : store.clip(clipId)
  const label = t(`reason.${reason}` as MessageKey)
  const effect = effectClass(settings.overlayEffect)
  const statusKey: MessageKey | null =
    phase === 'error' ? (snapshot.playback.message ?? 'overlay.error') : phase === 'stalled' ? 'overlay.stalled' : phase === 'loading' ? 'overlay.loading' : null

  return h(
    'div',
    { className: 'dbap-root' + (fading ? ' dbap-fading' : ''), onClick: activate },
    h('video', {
      ref: videoRef,
      className: settings.fitMode === 'cover' ? 'dbap-video dbap-cover' : 'dbap-video',
      muted: true,
      autoPlay: true,
      playsInline: true,
      preload: 'auto',
      onEnded: finishWithFade,
      onClick: (event: { stopPropagation: () => void }) => {
        event.stopPropagation()
        activate()
      },
      onError: () => {
        const video = videoRef.current
        const code = video?.error?.code ?? 0
        const message = video?.error?.message ?? ''
        notify('video element error', {
          code,
          message,
          clipId,
          src: video?.currentSrc || url,
          readyState: video?.readyState ?? -1,
        })
        // A clip that cannot be decoded is that clip's problem, not the
        // plugin's: report it, stay readable for a moment, then close.
        store.setPhase('error', 'overlay.error')
        window.setTimeout(() => {
          if (!closedRef.current) close()
        }, ERROR_LINGER_MS)
      },
    }),
    effect === null ? null : h('div', { className: 'dbap-fx ' + effect }),
    h('div', { className: 'dbap-what' }, `${label} · ${clip?.name ?? clipId ?? ''}`),
    settings.overlayTitle === '' && settings.overlaySubtitle === ''
      ? null
      : h(
          'div',
          { className: 'dbap-caption' },
          settings.overlayTitle === '' ? null : h('div', { className: 'dbap-caption-title' }, settings.overlayTitle),
          settings.overlaySubtitle === '' ? null : h('div', { className: 'dbap-caption-sub' }, settings.overlaySubtitle),
        ),
    settings.watermark === '' ? null : h('div', { className: 'dbap-watermark' }, settings.watermark),
    statusKey === null ? null : h('div', { className: 'dbap-status' }, t(statusKey)),
    settings.showProgress
      ? h('div', { className: 'dbap-progress' }, h('i', { style: { width: `${String(Math.round(progress * 100))}%` } }))
      : null,
    h(
      'button',
      {
        type: 'button',
        className: 'dbap-skip',
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          close()
        },
      },
      remaining !== null && remaining > 0 ? t('overlay.skipIn', { n: remaining }) : t('overlay.skip'),
    ),
    h(
      'div',
      { className: 'dbap-hint' },
      needsTap ? t('overlay.tapToPlay') : t('overlay.tapForSound'),
      previewClipId !== null && previewClipId === clipId ? ' · ' + t('overlay.previewing') : '',
    ),
  )
}
