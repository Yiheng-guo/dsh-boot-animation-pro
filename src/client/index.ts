/**
 * dsh-boot-animation-pro — browser half.
 *
 * Seating:
 *   - `shell.overlay`          the frame-wide floating layer for the animation
 *   - `sidebar.footer.action`  the pin toggle and the picker button, beside Settings
 * Both are list slots, so each is an added cell, never a replacement.
 *
 * NO STATIC `inject`, deliberately. A static dependency the host cannot satisfy
 * leaves this plugin's fiber PENDING forever, and the web boot treats ANY entry
 * that is not `active` as fatal — it throws `web boot: N entry did not activate`
 * and the entire GUI fails to load. That happened in the field:
 *
 *   dsh-boot-animation-pro: pending (waiting for service: uisession)
 *
 * A cosmetic intro animation must never be able to cost someone their harness, so
 * both services are resolved through cordis's dynamic injection: the wait happens
 * in a CHILD fiber and this entry activates immediately. On a host that never
 * provides them, the plugin silently does nothing — the correct failure mode for
 * an add-on like this one. `scripts/verify-client-boot.mjs` asserts the invariant.
 *
 * Everything below `apply` is the store, the trigger rules and the components;
 * the decisions themselves are in `store.ts`, `session.ts` and, on the host,
 * `clip-resolver.js`. This file only wires them to slots.
 */
import type { ReactElement } from 'react'
import { createElement as h } from 'react'
import { log, notify } from './diagnostics.js'
import { resolveLocale, translatorFor } from './i18n.js'
import { ClientStore } from './store.js'
import type { CurrentStore } from './session.js'
import { AppRoot, PinAction, openLibrary } from './ui.js'

// Re-exported so the shipped bundle can be tested directly, not a copy.
export { isBlankSession, resolveSessionId, decideTrigger } from './session.js'
export {
  ClientStore,
  mediaUrlFor,
  normaliseSettings,
  DEFAULT_SETTINGS,
  FIT_MODES,
  TRIGGER_MODES,
  SORT_MODES,
  OVERLAY_EFFECTS,
  LOCALES,
  SESSION_LIST_MODES,
} from './store.js'
export { CATALOGS, resolveLocale, translatorFor, formatMessage } from './i18n.js'
export { releaseVideo, effectClass } from './ui.js'
/**
 * The shipped stylesheet and its element id.
 *
 * Exported so `scripts/verify-letterbox.mjs` measures the REAL sheet in a real
 * layout engine. That suite used to carry its own copy of the CSS, which meant it
 * kept passing after the class names it copied had been renamed away.
 */
export { CSS, STYLE_ID } from './styles.js'

type ClientContext = {
  slots: {
    inject: (name: string, register: () => unknown) => unknown
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  uiSession?: { adapter?: { current?: CurrentStore } }
  effect?: (callback: () => unknown, label?: string) => unknown
  /**
   * cordis's dynamic injection, `Context.inject(deps, callback)`: the wait
   * happens in a CHILD fiber, so our own entry still reaches `active`. That is
   * the difference between "this plugin has nothing to attach to" and "the whole
   * web boot fails".
   */
  inject?: (deps: string[], callback: (ready: ClientContext) => unknown) => unknown
}

/** The ui-session store, when the host provides one that behaves. */
function storeOf(ready: ClientContext): CurrentStore | null {
  const candidate = ready.uiSession?.adapter?.current
  return candidate !== undefined &&
    typeof candidate.getSnapshot === 'function' &&
    typeof candidate.subscribe === 'function'
    ? candidate
    : null
}

export function apply(ctx: ClientContext): void {
  const wire = (ready: ClientContext): void => {
    const sessionStore = storeOf(ready)
    const store = new ClientStore()
    log('services ready', { hasUiSession: ready.uiSession !== undefined, hasStore: sessionStore !== null })

    const register = (): void => {
      // Slot names are inlined on purpose: the injector's pre-flight check reads
      // register() calls statically and cannot follow a constant.
      ready.slots.inject('shell.overlay', () =>
        ready.slots.register({ name: 'shell.overlay', id: 'dsh-boot-animation-pro', order: 900 }, () =>
          h(AppRoot, { store, sessionStore }),
        ),
      )
      ready.slots.inject('sidebar.footer.action', () =>
        ready.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'dsh-boot-animation-pro-pin',
            order: 40,
            // Resolved at call time: the label follows the language the user
            // picked, and the settings may not have loaded when this is built.
            label: () => translatorFor(resolveLocale(store.getSnapshot().settings.locale))('pin.label'),
          },
          () => h(PinAction, { store, sessionStore, onOpen: () => openLibrary() }) as ReactElement,
        ),
      )
    }

    if (typeof ready.effect === 'function') ready.effect(register, 'dsh-boot-animation-pro: mounts')
    else register()
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['slots', 'uiSession'], wire)
    return
  }

  // A host without dynamic injection. Mounting eagerly is only safe when the
  // services are already there; otherwise this plugin stays idle rather than
  // risking the pending-forever state that takes the whole GUI down.
  if (ctx.slots !== undefined && ctx.uiSession !== undefined) wire(ctx)
  else notify('idle: host offers no dynamic injection and no uiSession')
}
