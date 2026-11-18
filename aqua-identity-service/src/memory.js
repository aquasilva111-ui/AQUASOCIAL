/**
 * Memory stores for the confidential client. One process, no deploy.
 * Tokens stay here. The browser only receives an opaque cookie id.
 */
export function createMemoryStore() {
  const values = new Map()
  return {
    async set(key, value) {
      values.set(key, value)
    },
    async get(key) {
      return values.get(key)
    },
    async del(key) {
      values.delete(key)
    },
  }
}

const WINDOW_MS = 15 * 60 * 1000
const LIMIT = 5

export function createIpLimiter(now = () => Date.now()) {
  const hits = new Map()
  return function allow(ip) {
    const fresh = (hits.get(ip) ?? []).filter(
      stamp => now() - stamp < WINDOW_MS,
    )
    if (fresh.length >= LIMIT) {
      hits.set(ip, fresh)
      return false
    }
    fresh.push(now())
    hits.set(ip, fresh)
    return true
  }
}

export function sessionCookie(sessionId, secure) {
  if (!/^[A-Za-z0-9_-]{22,}$/.test(sessionId)) {
    throw new Error('session id must be an opaque random token')
  }
  const parts = [
    `aqua_session=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=604800',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}
