/**
 * Cookie contract for the confidential BFF.
 * The value is an opaque session id. It is never a password, DID document,
 * access token, or refresh token. The browser cannot read it (HttpOnly).
 */
export function buildSessionCookie(
  sessionId: string,
  options: {secure: boolean; maxAgeSeconds: number; name?: string},
): string {
  if (!/^[A-Za-z0-9_-]{22,}$/.test(sessionId)) {
    throw new Error('session id must be an opaque random token')
  }
  const name = options.name ?? 'aqua_session'
  const parts = [
    `${name}=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${Math.floor(options.maxAgeSeconds)}`,
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}
