import {createHmac, timingSafeEqual} from 'node:crypto'

/**
 * Temporary playback authorization. A token names one asset variant, the
 * grant it relies on and an expiry, and is HMAC-signed by the server.
 * Copying the URL only works until it expires (short TTL), and every
 * playlist request re-checks the asset and the entitlement.
 */
export type PlaybackClaims = {
  assetId: string
  variant: string
  /** Entitlement relied upon, re-checked on playlist loads ('' for owner/free/preview). */
  entitlementId: string
  /** Unix seconds. */
  exp: number
  /** Viewer DID, when the authorization is personal (live bans). */
  sub?: string
}

function b64(s: string) {
  return Buffer.from(s).toString('base64url')
}

export function signPlayback(claims: PlaybackClaims, secret: string): string {
  const payload = b64(JSON.stringify(claims))
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyPlayback(
  token: string,
  secret: string,
  now = Date.now(),
): PlaybackClaims | undefined {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return undefined
  const expected = createHmac('sha256', secret).update(payload).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return undefined
  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as PlaybackClaims
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now)
      return undefined
    return claims
  } catch {
    return undefined
  }
}
