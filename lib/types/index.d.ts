/**
 * Host half of dsh-boot-animation-pro.
 *
 * Hand-written, like the host itself: `src/host/` is plain JavaScript with no DSH
 * SDK imports and no compiler, so these declarations are the published contract
 * rather than something `tsc` emits. `tsdown` builds only the browser half.
 */
export declare const name: 'dsh-boot-animation-pro'
/** The host services this plugin waits for before it registers anything. */
export declare const inject: string[]
/** Register the routes. A failure here is the `plugin` error boundary. */
export declare function apply(ctx: unknown): void
