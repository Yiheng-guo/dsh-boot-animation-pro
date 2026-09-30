/**
 * harness.mjs — drive the REAL host half over its REAL routes.
 *
 * Every suite in this repo that talks to the host goes through here, and here is
 * deliberately the least clever code in the project:
 *
 *  - it imports `lib/index.js` — the built artifact — not a copy of the logic;
 *  - it calls the plugin's own `apply(ctx)` with a stand-in `ctx.webServer`;
 *  - it replicates the webserver's EXACT prefix rule, which is
 *      `pathname !== prefix && !pathname.startsWith(prefix + '/')`
 *    because a probe that used its own looser matcher once "proved" a route
 *    worked while the real server was 404ing every request.
 *
 * Nothing here reimplements plugin behaviour. It only moves bytes.
 */
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** A response that behaves enough like ServerResponse for pipes and chunks. */
class HarnessResponse extends Writable {
  constructor() {
    super()
    this.status = 0
    this.headerMap = {}
    this.parts = []
  }

  _write(chunk, _encoding, callback) {
    this.parts.push(Buffer.from(chunk))
    callback()
  }

  writeHead(status, headers = {}) {
    this.status = status
    for (const [key, value] of Object.entries(headers)) {
      this.headerMap[String(key).toLowerCase()] = String(value)
    }
    return this
  }

  setHeader(key, value) {
    this.headerMap[String(key).toLowerCase()] = String(value)
  }

  getHeader(key) {
    return this.headerMap[String(key).toLowerCase()]
  }

  end(chunk, encoding, callback) {
    if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
      this.parts.push(Buffer.from(chunk))
    }
    return super.end(undefined, encoding, callback)
  }

  get body() {
    return Buffer.concat(this.parts)
  }

  get text() {
    return this.body.toString('utf8')
  }

  get headers() {
    return this.headerMap
  }

  json() {
    return JSON.parse(this.text)
  }
}

/**
 * Start a harness against a fresh temp DSH_HOME.
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.env] extra env for the plugin
 * @param {string | null} [options.home] reuse an existing home instead of a temp one
 * @param {string} [options.hostEntry] path of the built host entry
 */
export async function startHarness(options = {}) {
  const created = options.home === undefined || options.home === null
  const home = created ? mkdtempSync(join(tmpdir(), 'dba-harness-')) : options.home
  const previous = { DSH_HOME: process.env.DSH_HOME, DSH_BOOT_ANIMATION: process.env.DSH_BOOT_ANIMATION }
  process.env.DSH_HOME = home
  if (options.env?.DSH_BOOT_ANIMATION === undefined) delete process.env.DSH_BOOT_ANIMATION
  for (const [key, value] of Object.entries(options.env ?? {})) process.env[key] = value

  // fileURLToPath, not `.pathname`: a Windows checkout can live under a
  // non-ASCII directory (this repo's does), and `.pathname` leaves it
  // percent-encoded so the import 404s with a mangled path in the error.
  const hostEntry = options.hostEntry ?? fileURLToPath(new URL('../../lib/index.js', import.meta.url))
  const url = pathToFileURL(hostEntry).href
  const mod = await import(url)

  /** @type {Array<{ kind: string, path: string, handler: Function }>} */
  const routes = []
  /** @type {Array<() => unknown>} */
  const disposers = []
  const ctx = {
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
    effect(callback) {
      disposers.push(/** @type {() => unknown} */ (callback()))
    },
  }

  mod.apply(ctx)

  /** The webserver's own matching rule, replicated. */
  function match(pathname) {
    for (const route of routes) {
      if (route.kind === 'exact' && pathname === route.path) return route
    }
    let best = null
    for (const route of routes) {
      if (route.kind !== 'prefix') continue
      const prefix = route.path
      if (pathname !== prefix && !pathname.startsWith(prefix + '/')) continue
      if (best === null || prefix.length > best.path.length) best = route
    }
    return best
  }

  /**
   * One request. Returns the full response, including `location` for redirects.
   *
   * @param {string} method
   * @param {string} pathAndQuery
   * @param {{ headers?: Record<string, string>, body?: unknown, raw?: Buffer | string }} [init]
   */
  async function request(method, pathAndQuery, init = {}) {
    const [pathname] = pathAndQuery.split('?')
    const route = match(pathname)
    if (route === null) {
      const miss = new HarnessResponse()
      miss.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      miss.end('NO ROUTE MATCHED')
      const done = await finish(miss)
      return { ...done, matched: false }
    }
    const req = new EventEmitter()
    req.method = method
    req.url = pathAndQuery
    /**
     * The headers a REAL client sends, before any override.
     *
     * `host` is always present on a Node HTTP request and `content-type` is what
     * the browser half sets on every write, so a probe that omitted them would be
     * testing a request shape no client ever produces — and would pass while the
     * real one was refused by `route-guard.js`. `sec-fetch-site` and `origin` are
     * deliberately NOT defaulted: an absent one means "not a browser", which the
     * guard allows, and the suites that care set them explicitly.
     */
    const defaults = { host: '127.0.0.1:19387' }
    // `raw` bodies are still JSON on the wire — a client sending malformed JSON
    // sends it as `application/json`, which is exactly the case the route's own
    // "invalid JSON body" branch exists for.
    if (init.body !== undefined) defaults['content-type'] = 'application/json'
    req.headers = Object.fromEntries(
      Object.entries({ ...defaults, ...(init.headers ?? {}) }).map(([key, value]) => [key.toLowerCase(), value]),
    )
    req.destroy = () => {}
    const res = new HarnessResponse()
    const settled = finish(res)
    route.handler(req, res)
    if (init.body !== undefined) {
      const payload = init.raw === true ? init.body : JSON.stringify(init.body)
      req.emit('data', Buffer.from(/** @type {any} */ (payload)))
    }
    req.emit('end')
    const done = await settled
    return { ...done, matched: true, path: pathname }
  }

  function finish(res) {
    return new Promise((resolve) => {
      const settle = () =>
        resolve({
          status: res.status,
          headers: res.headers,
          body: res.body,
          text: res.text,
          json: () => JSON.parse(res.text),
        })
      if (res.writableFinished) {
        settle()
        return
      }
      res.on('finish', settle)
      res.on('close', settle)
    })
  }

  /** Follow a redirect to its location. */
  async function follow(response, method = 'GET') {
    const location = response.headers.location
    if (typeof location !== 'string') throw new Error('follow() called on a response with no location')
    return request(method, location)
  }

  return {
    home,
    routes,
    request,
    follow,
    mod,
    put(fileName, contents) {
      const dir = join(home, 'boot-animation-pro', 'videos')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, fileName), contents)
      return join(dir, fileName)
    },
    selectionFile: () => join(home, 'boot-animation-pro', 'selection.json'),
    writeSelection(contents) {
      const dir = join(home, 'boot-animation-pro')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'selection.json'), typeof contents === 'string' ? contents : JSON.stringify(contents))
    },
    async close() {
      for (const dispose of disposers) {
        try {
          await dispose()
        } catch {
          /* the harness must never fail while tearing down */
        }
      }
      if (previous.DSH_HOME === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous.DSH_HOME
      if (previous.DSH_BOOT_ANIMATION === undefined) delete process.env.DSH_BOOT_ANIMATION
      else process.env.DSH_BOOT_ANIMATION = previous.DSH_BOOT_ANIMATION
      if (created) rmSync(home, { recursive: true, force: true })
    },
  }
}

/** A tiny assertion book used by every suite, so output looks the same. */
export function createReport(title) {
  const checks = []
  return {
    title,
    check(ok, label, detail = '') {
      checks.push({ ok, label, detail })
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok || detail === '' ? '' : `\n         ${detail}`}`)
    },
    finish() {
      const failed = checks.filter((c) => !c.ok)
      console.log('')
      if (failed.length === 0) {
        console.log(`all ${String(checks.length)} checks passed`)
        process.exit(0)
      }
      console.log(`${String(failed.length)} of ${String(checks.length)} check(s) failed:`)
      for (const f of failed) console.log('  - ' + f.label)
      process.exit(1)
    },
  }
}
