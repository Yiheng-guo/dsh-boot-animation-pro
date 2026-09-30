/**
 * The client's copy of the diagnostics idea.
 *
 * A black overlay reports nothing by itself — no network error, no thrown
 * exception, just a video element that never paints — so the four things needed
 * to diagnose one from the outside are logged unconditionally: which URL the
 * element actually used, when the first frame arrived, which error code the
 * element reported, and when the watchdog gave up. One line each, and only on a
 * play, so the noise is bounded.
 *
 * Everything else goes through `log`, which is off unless DEBUG is on.
 */

/** Set to true to narrate every decision in the browser console. */
export const DEBUG = false

/** Bounded, so a retry loop in a render cannot fill the console. */
const MAX_ENTRIES = 200
const entries: string[] = []

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}

function narrate(text: string): void {
  try {
    console.log('[dsh-boot-animation-pro] ' + text)
  } catch {
    /* console unavailable */
  }
}

/** Record one always-on line. Never throws. */
export function notify(...args: unknown[]): void {
  const text = formatArgs(args)
  try {
    entries.push(text)
    while (entries.length > MAX_ENTRIES) entries.shift()
  } catch {
    /* diagnostics must never break a render */
  }
  narrate(text)
}

/** Record a development-only line. */
export function log(...args: unknown[]): void {
  if (!DEBUG) return
  const text = formatArgs(args)
  try {
    entries.push(text)
    while (entries.length > MAX_ENTRIES) entries.shift()
  } catch {
    /* as above */
  }
  narrate(text)
}

/** What has been recorded this page, newest last. */
export function recentEntries(): string[] {
  return entries.slice()
}
