/**
 * IU Chat embed policy shared by the app, the web dev server, and server.js.
 * The chat URL is public configuration, never a secret.
 */

const DEFAULT_IU_CHAT_URL = 'http://localhost:3080'
const PROBE_PATH = '/iu-chat-probe'

function normalizeIuChatUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return DEFAULT_IU_CHAT_URL
  return value.replace(/\/+$/, '')
}

function iuChatUpstream() {
  return normalizeIuChatUrl(process.env.EXPO_PUBLIC_IU_CHAT_URL)
}

/**
 * Schemeful same-site check. Ports are ignored. localhost and 127.0.0.1 are
 * different sites, which matches how browsers treat the session cookie.
 */
function isSameSite(aquaOrigin, chatUrl) {
  let aqua
  let chat
  try {
    aqua = new URL(aquaOrigin)
    chat = new URL(chatUrl)
  } catch {
    return false
  }
  if (aqua.protocol !== chat.protocol) return false
  return registrableHost(aqua.hostname) === registrableHost(chat.hostname)
}

function registrableHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '')
  if (!host) return host
  // No public suffix: the whole host is the site, including *.localhost.
  if (host === 'localhost' || host.endsWith('.localhost')) return host
  if (host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host
  const labels = host.split('.')
  if (labels.length <= 2) return host
  return labels.slice(-2).join('.')
}

function assessIuChatEmbed({
  aquaOrigin,
  chatUrl,
  xFrameOptions,
  contentSecurityPolicy,
}) {
  const sameSite = isSameSite(aquaOrigin, chatUrl)
  let chatOrigin = ''
  try {
    chatOrigin = new URL(chatUrl).origin
  } catch {
    return {frameable: false, sameSite: false}
  }
  const ancestors = enforcedFrameAncestors(contentSecurityPolicy)
  if (ancestors) {
    return {
      frameable: ancestors.some(source =>
        ancestorAllows(source, aquaOrigin, chatOrigin),
      ),
      sameSite,
    }
  }
  const xfo = String(xFrameOptions || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (!xfo) return {frameable: true, sameSite}
  if (xfo === 'deny') return {frameable: false, sameSite}
  if (xfo === 'sameorigin') {
    return {frameable: aquaOrigin === chatOrigin, sameSite}
  }
  return {frameable: false, sameSite}
}

function enforcedFrameAncestors(csp) {
  if (!csp) return null
  const found = String(csp)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .find(part => part.toLowerCase().startsWith('frame-ancestors'))
  if (!found) return null
  return found.split(/\s+/).slice(1)
}

function ancestorAllows(source, aquaOrigin, chatOrigin) {
  const src = String(source || '').trim()
  if (!src || src === "'none'") return false
  if (src === '*') return true
  if (src.toLowerCase() === "'self'") return aquaOrigin === chatOrigin
  const wildcard = src.match(/^(https?:)\/\/\*\.([^/\s]+)$/i)
  if (wildcard) {
    let aqua
    try {
      aqua = new URL(aquaOrigin)
    } catch {
      return false
    }
    if (aqua.protocol !== `${wildcard[1].toLowerCase()}:`) return false
    const suffix = wildcard[2].toLowerCase()
    return aqua.hostname === suffix || aqua.hostname.endsWith(`.${suffix}`)
  }
  try {
    return new URL(src).origin === new URL(aquaOrigin).origin
  } catch {
    return false
  }
}

/**
 * @returns {'embed' | 'down' | 'cross-site' | 'framing'}
 */
function decideIuChatView({
  reachable,
  frameable,
  sameSite,
  framingKnown,
  native,
}) {
  if (!reachable) return 'down'
  // A native WebView is the top-level document, so framing and third-party
  // cookie rules do not apply.
  if (native) return 'embed'
  if (!sameSite) return 'cross-site'
  if (framingKnown && !frameable) return 'framing'
  return 'embed'
}

function aquaOriginFrom(req) {
  const forwarded = req.headers['x-forwarded-proto']
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded || 'http')
    .split(',')[0]
    .trim()
  return `${proto}://${req.headers.host || 'localhost'}`
}

async function handleIuChatProbe(req, res) {
  const url = iuChatUpstream()
  const aquaOrigin = aquaOriginFrom(req)
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }
  let reachable = false
  let frameable = false
  try {
    const response = await fetch(url, {method: 'GET', redirect: 'manual'})
    reachable = true
    frameable = assessIuChatEmbed({
      aquaOrigin,
      chatUrl: url,
      xFrameOptions: response.headers.get('x-frame-options'),
      contentSecurityPolicy: response.headers.get('content-security-policy'),
    }).frameable
  } catch {
    reachable = false
  }
  const sameSite = isSameSite(aquaOrigin, url)
  res.writeHead(200, headers)
  res.end(JSON.stringify({reachable, frameable, sameSite, url}))
}

module.exports = {
  DEFAULT_IU_CHAT_URL,
  PROBE_PATH,
  normalizeIuChatUrl,
  iuChatUpstream,
  isSameSite,
  assessIuChatEmbed,
  decideIuChatView,
  handleIuChatProbe,
}
