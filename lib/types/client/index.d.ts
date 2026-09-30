/**
 * Browser half of dsh-boot-animation-pro.
 *
 * The bundle is a `window.__ModuleLoader__` factory, so the host only ever calls
 * `apply`. Note the deliberate absence of `inject`: a static dependency the host
 * cannot satisfy holds this entry in `pending`, and the web boot treats any
 * non-`active` entry as fatal — see `src/client/index.ts`.
 */
export declare function apply(ctx: unknown): void
