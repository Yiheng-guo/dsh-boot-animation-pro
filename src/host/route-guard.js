/**
 * route-guard.js — the check every MUTATING route runs before it touches anything.
 *
 * Why this exists, stated plainly: this plugin registers its routes on DSH's web
 * server, and those routes are reachable WITHOUT the web token that DSH itself
 * requires for the app shell. Adding `POST /remove` on top of that created a real
 * vulnerability, and it was reproduced before this file was written:
 *
 *   curl -X POST -H 'Content-Type: text/plain' -H 'Origin: https://evil.example' \
 *        --data '{"clipId":"intro-1a2b3c4d"}' \
 *        http://127.0.0.1:19387/dsh-boot-animation-pro/remove
 *   -> {"ok":true,"removed":"intro"}          the user's file, deleted
 *
 * No cookie, no token, no preflight. Any page the user visits could do that, and
 * DNS rebinding removes even the read barrier by making the attacker's origin
 * resolve to 127.0.0.1.
 *
 * The defense is four independent gates, because each one alone has a hole:
 *
 *   1. HOST must be a loopback name. A rebinding attack arrives with the
 *      attacker's hostname in `Host`, so this is the gate that closes it.
 *   2. `Sec-Fetch-Site: cross-site` is refused. Chromium sends this on every
 *      request; an attacker cannot forge or suppress it.
 *   3. A present `Origin` must be a loopback origin. Browsers send `Origin` on
 *      every POST, including same-origin ones, so a legitimate client passes.
 *   4. `Content-Type` must be `application/json`. This is the gate that works on
 *      browsers too old to send (1)-(3): a cross-origin POST with a non-safelisted
 *      content type forces a CORS preflight, this server answers no preflight,
 *      and the browser never sends the request.
 *
 * An ABSENT `Origin`/`Sec-Fetch-Site` is allowed on purpose. That is a non-browser
 * caller — curl, a test harness, a script — and a process that can already talk to
 * loopback on this machine has the user's file access anyway. The threat this file
 * addresses is the user's BROWSER being used against them, and a browser cannot
 * omit those headers.
 */

/** Hostnames that mean "this machine". */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0000:0000:0000:0000:0000:0000:0000:0001'])

/** The content type a genuine client sends, and the only one accepted. */
const REQUIRED_CONTENT_TYPE = 'application/json'

/** Hostnames a URL's host part may carry for `Origin` to count as loopback. */
const LOOPBACK_ORIGIN_PROTOCOLS = new Set(['http:', 'https:'])

/** The host part of a `Host` header, without its port. Null when unusable. */
export function hostNameOf(hostHeader) {
  const raw = String(hostHeader ?? '').trim().toLowerCase()
  if (raw === '') return null
  // Bracketed IPv6 literal: the port, if any, follows the closing bracket.
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']')
    return end === -1 ? null : raw.slice(1, end)
  }
  const colon = raw.lastIndexOf(':')
  // A bare IPv6 address has several colons and no port; `lastIndexOf` would cut it.
  if (colon !== -1 && raw.indexOf(':') === colon) return raw.slice(0, colon)
  return raw
}

/** Whether a hostname (already lower-cased, no port) refers to this machine. */
export function isLoopbackHost(host) {
  if (typeof host !== 'string' || host === '') return false
  if (LOOPBACK_HOSTS.has(host)) return true
  // 127.0.0.0/8 is entirely loopback.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}

/** Whether an `Origin` header value is this machine. */
export function isLoopbackOrigin(origin) {
  const raw = String(origin ?? '').trim()
  // `Origin: null` is what a sandboxed iframe or a file:// page sends. It is not
  // this app, so it does not pass.
  if (raw === '' || raw === 'null') return false
  let url
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (!LOOPBACK_ORIGIN_PROTOCOLS.has(url.protocol)) return false
  return isLoopbackHost(url.hostname.toLowerCase())
}

/** The media type of a `Content-Type` header, lower-cased, without parameters. */
export function mediaTypeOf(contentType) {
  const raw = String(contentType ?? '').trim().toLowerCase()
  const semi = raw.indexOf(';')
  return (semi === -1 ? raw : raw.slice(0, semi)).trim()
}

/**
 * Whether one request may change state.
 *
 * Returns a decision rather than writing a response, so the caller owns the reply
 * and a test can assert the reason without parsing prose.
 *
 * @param {{ headers?: Record<string, unknown> }} req
 * @returns {{ allowed: true } | { allowed: false, status: number, reason: string }}
 */
export function checkMutation(req) {
  const headers = req?.headers ?? {}

  // 1. Host: closes DNS rebinding.
  const host = hostNameOf(headers.host)
  if (host !== null && !isLoopbackHost(host)) {
    return { allowed: false, status: 403, reason: 'cross-host request refused' }
  }

  // 2. Sec-Fetch-Site: the browser's own statement, which a page cannot forge.
  const site = String(headers['sec-fetch-site'] ?? '').trim().toLowerCase()
  if (site === 'cross-site') {
    return { allowed: false, status: 403, reason: 'cross-site request refused' }
  }

  // 3. Origin: present on every browser POST, including same-origin.
  const origin = headers.origin
  if (origin !== undefined && origin !== '' && !isLoopbackOrigin(origin)) {
    return { allowed: false, status: 403, reason: 'request from a foreign origin refused' }
  }

  // 4. Content type: forces a preflight on browsers too old for gates 2 and 3.
  const type = mediaTypeOf(headers['content-type'])
  if (type !== REQUIRED_CONTENT_TYPE) {
    return {
      allowed: false,
      status: 415,
      reason: `this endpoint requires Content-Type: ${REQUIRED_CONTENT_TYPE}`,
    }
  }

  return { allowed: true }
}
