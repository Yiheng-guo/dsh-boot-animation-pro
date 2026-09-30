/**
 * The client's public surface, re-exported from the four files that own it.
 *
 * The components used to live in one 561-line module. Splitting them is not
 * cosmetic: the overlay, the picker and the pin are three different React roots
 * with three different failure modes, and a single file made it hard to see where
 * one ended and the next began — the picker's own "Escape closes me" rule sat 150
 * lines away from the overlay's "Escape skips me" rule, and in practice both
 * fired.
 *
 * This module is the only import site for the entry point, and it exists so that
 * `lib/client.js` keeps exporting exactly the names the shipped test suites
 * (`verify-teardown.mjs`, `verify-preview.mjs`, …) resolve against the bundle:
 * `releaseVideo`, `mediaUrlFor`, `ClientStore`, `isBlankSession`,
 * `resolveSessionId`.
 */
export { BootOverlay, effectClass, releaseVideo, setSkipKeysEnabled } from './ui-overlay.js'
export { VideoLibrary } from './ui-library.js'
export { PinAction } from './ui-pin.js'
export { AppRoot, libraryOpeners, openLibrary } from './ui-root.js'
export { mediaUrlFor } from './store.js'
