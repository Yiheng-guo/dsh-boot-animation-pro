/**
 * dsh-boot-animation-pro — host half.
 *
 * This file owns exactly one thing: HTTP. It builds the collaborators (registry,
 * resolver, selection store, media server, diagnostics, random, errors) and
 * registers the routes that expose them. It decides nothing about clips itself —
 * every "which clip" question goes through ClipResolver, every byte through
 * MediaServer, and every "is this value allowed" question through `settings.js`.
 *
 * Plain JavaScript with no DSH SDK imports, so it needs no compiler: the build
 * copies `src/host/` over `lib/host/` and writes the `lib/index.js` shim.
 *
 * Routes (all under /dsh-boot-animation-pro):
 *
 *   GET  /media/<clipId>     the canonical, per-clip media resource
 *   GET  /boot.mp4           backward compatibility: 302 to the canonical URL
 *   GET  /resolve.json       the single "which clip plays now" answer
 *   GET  /videos.json        the library, the selection and the settings
 *   POST /select             change any setting, or apply a small operation
 *   POST /remove             delete one of the user's own video files
 *   GET  /status.json        diagnostics, active clip, full listing
 *
 * Layout on disk:
 *   $DSH_HOME/boot-animation-pro/selection.json   settings only (see settings.js)
 *   $DSH_HOME/boot-animation-pro/videos/*.mp4     the user's own clips
 *   $DSH_HOME/boot-animation-pro/intro.mp4        legacy drop-in, still honoured
 *   $DSH_HOME/boot-animation/…                    the 0.3.x layout, read-only
 *   lib/clips.meta.js + lib/clips.data.js         the embedded built-ins
 *
 * The `boot-animation` directory of the version this fork came from is still
 * scanned, read-only, so an existing library keeps working after the upgrade
 * instead of silently emptying. Its `selection.json` is imported once, on the
 * first read, and never written back to.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLIPS } from '../clips.meta.js'
import { ACTIVE_ALIAS, normalizeClipId } from './clip-id.js'
import { ClipRegistry } from './clip-registry.js'
import { ClipResolver } from './clip-resolver.js'
import { Diagnostics } from './diagnostics.js'
import { PluginError, asBootAnimationError } from './errors.js'
import { isRemovable, removeClipFile } from './library-ops.js'
import { MediaServer } from './media-server.js'
import { RandomController } from './random-controller.js'
import { checkMutation } from './route-guard.js'
import { SelectionStore } from './selection-store.js'
import {
  FIT_MODES,
  LOCALES,
  OVERLAY_EFFECTS,
  SELECTION_VERSION,
  SESSION_LIST_MODES,
  SORT_MODES,
  TRIGGER_MODES,
} from './settings.js'

export const name = 'dsh-boot-animation-pro'

/** The webserver routes are the only host service this plugin needs. */
export const inject = ['webServer']

const HERE = dirname(fileURLToPath(import.meta.url))
/** lib/host/index.js -> package root */
const PKG_ROOT = join(HERE, '..', '..')

const BASE_ROUTE = '/dsh-boot-animation-pro'
const ROUTE = BASE_ROUTE + '/boot.mp4'
/**
 * NO trailing slash. The webserver matches a prefix route with
 *   pathname !== prefix && !pathname.startsWith(prefix + '/')
 * so a registered path of `.../media/` would be tested as `.../media//` and
 * never match a real `.../media/<id>` request — every media URL 404s.
 */
const MEDIA_ROUTE = BASE_ROUTE + '/media'
const LIST_ROUTE = BASE_ROUTE + '/videos.json'
const SELECT_ROUTE = BASE_ROUTE + '/select'
const REMOVE_ROUTE = BASE_ROUTE + '/remove'
const STATUS_ROUTE = BASE_ROUTE + '/status.json'
const RESOLVE_ROUTE = BASE_ROUTE + '/resolve.json'
const DATA_MODULE = '../clips.data.js'

/** Where this fork keeps its own files, and where its predecessor kept them. */
const HOME_DIR_NAME = 'boot-animation-pro'
const LEGACY_DIR_NAME = 'boot-animation'

function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : '0'
  } catch {
    return '0'
  }
}

function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

function homeDir() {
  return join(dshHome(), HOME_DIR_NAME)
}

function legacyDir() {
  return join(dshHome(), LEGACY_DIR_NAME)
}

/**
 * The directories clips are discovered in.
 *
 * The first two are the plugin's own and are writable. The last two belong to the
 * version this fork came from: they are scanned so an existing library survives
 * the upgrade, and they are NOT writable, so the panel never offers to delete a
 * file that the other plugin also manages.
 */
function scanDirs() {
  const dir = homeDir()
  const legacy = legacyDir()
  return [
    { source: 'yours', dir: join(dir, 'videos'), writable: true },
    { source: 'yours', dir, writable: true },
    { source: 'legacy', dir: join(legacy, 'videos'), writable: false },
    { source: 'legacy', dir: legacy, writable: false },
  ]
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload, null, 2))
}

/**
 * Plain-text reply, always uncacheable.
 *
 * Every failure path says `no-store`: a 404 with no cache directive is
 * heuristically cacheable, so a route that 404s once while it is broken keeps
 * 404ing in that browser after the fix.
 */
function sendText(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** Read and parse a JSON request body, bounded so a broken client cannot flood us. */
function readJsonBody(req, res, onBody) {  let body = ''
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > 65536) req.destroy()
  })
  req.on('end', () => {
    let parsed = null
    try {
      parsed = JSON.parse(body)
    } catch {
      sendJson(res, { ok: false, error: 'invalid JSON body' }, 400)
      return
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      sendJson(res, { ok: false, error: 'body must be an object' }, 400)
      return
    }
    onBody(parsed)
  })
  req.on('error', () => {
    try {
      sendJson(res, { ok: false, error: 'request error' }, 400)
    } catch {
      /* socket already gone */
    }
  })
}

export function apply(ctx) {
  const diagnostics = new Diagnostics({ version: readVersion() })
  const selection = new SelectionStore(join(homeDir(), 'selection.json'), {
    diagnostics,
    legacyFile: join(legacyDir(), 'selection.json'),
  })
  const registry = new ClipRegistry({ embedded: CLIPS, scanDirs, diagnostics })
  const random = new RandomController()
  const resolver = new ClipResolver({
    registry,
    selection,
    random,
    envPath: () => (typeof process.env.DSH_BOOT_ANIMATION === 'string' ? process.env.DSH_BOOT_ANIMATION : null),
    diagnostics,
  })
  const media = new MediaServer({ dataModulePath: DATA_MODULE, diagnostics })

  diagnostics.event('plugin-applied', { clips: CLIPS.length, cli: 'dynamic-inject', schema: SELECTION_VERSION })

  /** The ids the selection is allowed to reference, so a dangling reference fails the write. */
  const knownClipIds = () => new Set(registry.list().map((clip) => clip.id))
  const clipDirs = () => scanDirs()

  /**
   * One clip as the wire format has always spelled it, plus the new fields.
   *
   * `name` is the user's alias when they set one; `originalName` keeps the name
   * derived from the file so the rename field can show what it would fall back to.
   */
  function publicClip(clip, settings) {
    const alias = settings.aliases[clip.id]
    return {
      id: clip.id,
      name: typeof alias === 'string' && alias !== '' ? alias : clip.name,
      originalName: clip.name,
      renamed: typeof alias === 'string' && alias !== '',
      file: clip.file,
      ext: clip.ext,
      source: clip.source,
      kind: clip.kind,
      writable: clip.writable,
      /** Whether `POST /remove` would actually delete this row's file. */
      removable: isRemovable(clip, clipDirs()),
      favorite: settings.favorites.includes(clip.id),
      embedded: clip.embedded ?? null,
      bytes: clip.bytes,
      mtime: clip.mtime,
      legacy: clip.legacy,
      faststart: clip.faststart === true,
      /**
       * The identity a client pins into the media URL as `?v=`.
       *
       * `clip.version()`, NOT `contentKey`: a file that never needed hashing has no
       * contentKey, and emitting null there would leave the client pinning nothing
       * while the media server compared `s<size>-t<mtime>` — a mismatch that
       * silently costs every replay a revalidation round trip.
       */
      version: clip.version(),
      /** The canonical resource for this clip. Never a shared URL. */
      mediaUrl: `${MEDIA_ROUTE}/${encodeURIComponent(clip.id)}`,
      copies: clip.copies ?? 1,
      alsoAt: clip.alsoAt ?? [],
      selected: settings.selectedClipId === clip.id,
    }
  }

  /** The picker's order, as the `sortMode` setting asks for. */
  function sortClips(clips, settings) {
    const favorites = new Set(settings.favorites)
    const byName = (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')
    const modes = {
      default: null,
      // Favourites float to the top of every explicit ordering: starring a clip is
      // a statement about where it should be found, not a separate view.
      name: (a, b) => byName(a, b),
      size: (a, b) => b.bytes - a.bytes || byName(a, b),
      newest: (a, b) => b.mtimeMs - a.mtimeMs || byName(a, b),
      oldest: (a, b) => a.mtimeMs - b.mtimeMs || byName(a, b),
    }
    const comparator = modes[settings.sortMode]
    if (comparator === null || comparator === undefined) return clips
    return [...clips].sort((a, b) => {
      const starA = favorites.has(a.id) ? 0 : 1
      const starB = favorites.has(b.id) ? 0 : 1
      return starA - starB || comparator(a, b)
    })
  }

  /** The library listing, shared by /videos.json and /status.json. */
  const libraryPayload = () => {
    const settings = selection.read()
    const clips = sortClips(registry.list(), settings)
    const { clip, how, rule } = resolver.resolveActive()
    return {
      clips,
      active: clip,
      how,
      rule: rule ?? null,
      settings,
      payload: {
        // Historical field names, kept: an old client reads these.
        activeId: clip === null ? null : clip.id,
        activeHow: how,
        activeVersion: clip === null ? null : clip.version(),
        videos: clips.map((item) => publicClip(item, settings)),
        userDir: join(homeDir(), 'videos'),
        accepts: [...new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv'])],
        // New: the settings that used to be split between localStorage and here.
        selectedClipId: settings.selectedClipId,
        randomPlayback: settings.randomPlayback,
        fitMode: settings.fitMode,
        selectionVersion: settings.version,
        mediaRoute: MEDIA_ROUTE,
        /**
         * Every setting, verbatim, so the client never has to guess a default and
         * a newly added field reaches the panel without a second endpoint.
         */
        settings,
        /**
         * The allowed values for each enumeration, published rather than copied
         * into the client. `verify-settings.mjs` asserts the client's own lists
         * match these, so a value can only be added in one place.
         */
        schema: {
          version: SELECTION_VERSION,
          fitModes: FIT_MODES,
          triggerModes: TRIGGER_MODES,
          sortModes: SORT_MODES,
          overlayEffects: OVERLAY_EFFECTS,
          locales: LOCALES,
          sessionListModes: SESSION_LIST_MODES,
        },
      },
    }
  }

  const serveList = (_req, res) => {
    try {
      sendJson(res, libraryPayload().payload)
    } catch (cause) {
      const error = asBootAnimationError(cause, 'plugin', 'serving the library')
      diagnostics.event('library-error', { message: error.message })
      sendJson(res, { ok: false, error: 'library unavailable', boundary: error.boundary }, 500)
    }
  }

  const serveStatus = (_req, res) => {
    try {
      const { payload } = libraryPayload()
      sendJson(res, {
        active: payload.activeId,
        activeHow: payload.activeHow,
        activeVersion: payload.activeVersion,
        count: payload.videos.length,
        selectedClipId: payload.selectedClipId,
        randomPlayback: payload.randomPlayback,
        fitMode: payload.fitMode,
        selectionVersion: payload.selectionVersion,
        /** The new settings, flattened, so a support question is answerable from here. */
        settings: payload.settings,
        /**
         * How many embedded clips are currently decoded in memory.
         *
         * Reported because "the plugin must not decode all four clips at
         * install" is otherwise unobservable from outside — and an install-time
         * stall is exactly the kind of regression that no unit test notices.
         */
        decodedClips: media.decoded.size,
        videos: payload.videos,
        diagnostics: diagnostics.snapshot(),
      })
    } catch (cause) {
      const error = asBootAnimationError(cause, 'plugin', 'serving status')
      sendJson(res, { ok: false, error: 'status unavailable', boundary: error.boundary }, 500)
    }
  }

  /**
   * The single answer to "which clip plays now".
   *
   * `mode=active` respects schedule → random (when enabled) → selection → env →
   * legacy drop-in → library → embedded; `mode=random` asks for a random pick
   * outright; `mode=selected` returns the stored selection; `mode=schedule`
   * returns whichever time rule is live right now, or null. Everything
   * downstream plays the returned clipId through ONE media path.
   */
  const serveResolve = (req, res) => {
    try {
      const raw = typeof req.url === 'string' ? req.url : ''
      const query = raw.indexOf('?') === -1 ? '' : raw.slice(raw.indexOf('?') + 1)
      const mode = new URLSearchParams(query).get('mode') ?? 'active'
      const describe = (clip, how, extra = {}) => ({
        clipId: clip === null ? null : clip.id,
        version: clip === null ? null : clip.version(),
        how,
        mediaUrl: clip === null ? null : `${MEDIA_ROUTE}/${encodeURIComponent(clip.id)}`,
        ...extra,
      })

      if (mode === 'selected') {
        const id = selection.read().selectedClipId
        const clip = id === null ? null : registry.get(id)
        sendJson(res, describe(clip, clip === null ? 'none' : 'selected'))
        return
      }
      if (mode === 'schedule') {
        const hit = resolver.resolveScheduled()
        sendJson(
          res,
          hit === null
            ? describe(null, 'none')
            : describe(hit.clip, 'schedule', { rule: { id: hit.rule.id, label: hit.rule.label } }),
        )
        return
      }
      if (mode === 'random') {
        const pool = resolver.playable()
        const chosen = random.pick(pool)
        sendJson(res, describe(chosen, chosen === null ? 'none' : 'random', { poolSize: pool.length }))
        return
      }
      const { clip, how, rule: hitRule } = resolver.resolveActive()
      sendJson(res, describe(clip, how, hitRule === undefined ? {} : { rule: { id: hitRule.id, label: hitRule.label } }))
    } catch (cause) {
      const error = asBootAnimationError(cause, 'plugin', 'resolving the active clip')
      diagnostics.event('resolve-error', { message: error.message })
      sendJson(res, { clipId: null, how: 'error', boundary: error.boundary }, 500)
    }
  }

  /**
   * The pre-flight every mutating route runs.
   *
   * See `route-guard.js` for why this is not paranoia: without it, a page the user
   * merely VISITS can delete their videos, because these routes are outside the
   * web token DSH requires for the app shell.
   *
   * @returns {boolean} true when the caller may proceed
   */
  const mutationAllowed = (req, res) => {
    const decision = checkMutation(req)
    if (decision.allowed) return true
    diagnostics.event('mutation-refused', { reason: decision.reason, status: decision.status })
    sendJson(res, { ok: false, error: decision.reason }, decision.status)
    return false
  }

  /** `POST /select` — the user's choices, and nothing but the choices. */
  const handleSelect = (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { ok: false, error: 'POST required' }, 405)
      return
    }
    if (!mutationAllowed(req, res)) return
    readJsonBody(req, res, (parsed) => {
      // `id` is the 0.1.x/0.2.x spelling for the selected clip. Translated here so
      // the settings layer only ever sees one name for the field.
      const patch = { ...parsed }
      if (Object.prototype.hasOwnProperty.call(parsed, 'id') && !Object.prototype.hasOwnProperty.call(parsed, 'selectedClipId')) {
        patch.selectedClipId = parsed.id
      }
      delete patch.id

      if (Object.keys(patch).length === 0) {
        sendJson(res, { ok: false, error: 'nothing to change' }, 400)
        return
      }
      try {
        const next = selection.write(patch, { knownClipIds: knownClipIds() })
        diagnostics.event('selection-written', { fields: Object.keys(patch) })
        // The listing changed under us: drop the cached scan so the next read
        // reports the new state rather than the previous answer.
        registry.invalidate()
        sendJson(res, { ok: true, settings: next, ...summarise(next) })
      } catch (cause) {
        const error = asBootAnimationError(cause, 'clip', 'saving the selection')
        const status = error.status ?? 400
        diagnostics.event('selection-write-failed', { message: error.message, status })
        sendJson(res, { ok: false, error: error.message, boundary: error.boundary }, status)
      }
    })
  }

  /** The handful of derived fields older clients read straight off the select reply. */
  function summarise(settings) {
    return {
      selectedClipId: settings.selectedClipId,
      randomPlayback: settings.randomPlayback,
      fitMode: settings.fitMode,
      name: settings.selectedClipId === null ? null : (registry.get(settings.selectedClipId)?.name ?? null),
    }
  }

  /**
   * `POST /remove` — delete one of the user's own video files.
   *
   * The only destructive route in the plugin. It is a POST, it names exactly one
   * clip, and `library-ops.js` re-checks on every call that the file is still
   * where the listing said it was. A clip that is not removable is refused, not
   * ignored.
   */
  const handleRemove = (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, { ok: false, error: 'POST required' }, 405)
      return
    }
    if (!mutationAllowed(req, res)) return
    readJsonBody(req, res, (parsed) => {
      const id = normalizeClipId(parsed.clipId ?? parsed.id)
      if (id === null || id === ACTIVE_ALIAS) {
        sendJson(res, { ok: false, error: 'clipId must be a real ClipId' }, 400)
        return
      }
      const clip = registry.get(id)
      if (clip === null) {
        sendJson(res, { ok: false, error: 'no clip with that id' }, 404)
        return
      }
      try {
        const { removed } = removeClipFile(clip, clipDirs())
        diagnostics.event('clip-removed', { id, name: clip.name })
        // The file is gone: a selection or time rule pointing at it must stop
        // pretending to resolve, which the cache would otherwise hide.
        registry.invalidate()
        const settings = selection.read()
        if (settings.selectedClipId === id) {
          try {
            const next = selection.write({ selectedClipId: null }, { knownClipIds: knownClipIds() })
            diagnostics.event('selection-cleared', { reason: 'the selected clip was deleted', ...summarise(next) })
          } catch (error) {
            diagnostics.event('selection-clear-failed', { reason: String(error?.message ?? error) })
          }
        }
        sendJson(res, { ok: true, removed: clip.name, id })
      } catch (cause) {
        const error = asBootAnimationError(cause, 'clip', 'removing a clip')
        const status = error.status ?? 400
        diagnostics.event('clip-remove-failed', { id, message: error.message, status })
        sendJson(res, { ok: false, error: error.message, boundary: error.boundary }, status)
      }
    })
  }

  /** `GET /media/<clipId>` — the canonical resource. One clip, one identity. */
  const serveMedia = (req, res) => {
    const raw = typeof req.url === 'string' ? req.url : ''
    const path = raw.split('?')[0]
    const id = path.length > MEDIA_ROUTE.length + 1 ? decodeURIComponent(path.slice(MEDIA_ROUTE.length + 1)) : ''
    const clip = id === '' ? null : resolver.resolve(id)?.clip ?? null
    if (clip === null) {
      sendText(res, 404, 'dsh-boot-animation-pro: no such clip id')
      return
    }
    void media.serve(req, res, clip)
  }

  /**
   * `GET /boot.mp4` — backward compatibility ONLY.
   *
   * It redirects to the canonical per-clip URL instead of serving bytes under a
   * shared name. That is what removes the stale-cache hazard for any client that
   * still asks for it: the bytes always come from a URL that identifies one clip.
   */
  const serveBoot = (req, res) => {
    try {
      const { clip } = resolver.resolveActive()
      if (clip === null) {
        sendText(
          res,
          404,
          'dsh-boot-animation-pro: no clip found (drop an .mp4 into ' +
            join(homeDir(), 'videos') +
            ', set DSH_BOOT_ANIMATION, or add $DSH_HOME/boot-animation/intro.mp4)',
        )
        return
      }
      const version = clip.version()
      const location =
        `${MEDIA_ROUTE}/${encodeURIComponent(clip.id)}` + (version === null ? '' : `?v=${encodeURIComponent(version)}`)
      diagnostics.event('legacy-redirect', { id: clip.id })
      res.writeHead(302, { location, 'cache-control': 'no-store' })
      res.end()
    } catch (cause) {
      const error = asBootAnimationError(cause, 'plugin', 'redirecting the legacy route')
      diagnostics.event('legacy-route-error', { message: error.message })
      sendText(res, 500, 'dsh-boot-animation-pro: could not resolve a clip')
    }
  }

  // A failure while REGISTERING is the plugin boundary: report it and stop,
  // never let it escape into the host boot.
  try {
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: MEDIA_ROUTE, handler: serveMedia }),
      'dsh-boot-animation-pro: clip media',
    )
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: serveBoot }),
      'dsh-boot-animation-pro: legacy boot url',
    )
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: RESOLVE_ROUTE, handler: serveResolve }),
      'dsh-boot-animation-pro: resolve',
    )
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: LIST_ROUTE, handler: serveList }),
      'dsh-boot-animation-pro: library',
    )
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: SELECT_ROUTE, handler: handleSelect }),
      'dsh-boot-animation-pro: select',
    )
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: REMOVE_ROUTE, handler: handleRemove }),
      'dsh-boot-animation-pro: remove',
    )
    ctx.effect(
      () => ctx.webServer.register({ kind: 'prefix', path: STATUS_ROUTE, handler: serveStatus }),
      'dsh-boot-animation-pro: status',
    )
  } catch (cause) {
    const error = cause instanceof PluginError ? cause : new PluginError(`route registration failed: ${String(cause)}`)
    diagnostics.event('plugin-failed', { message: error.message })
    throw error
  }
}
