import {createCodeChallenge, createCodeVerifier, createOAuthState} from './pkce'
import {type KeyValueStore} from './storage'
import {type PendingOAuth} from './types'

export const PENDING_KEY = 'aqua-identity.oauth-pending.v1'
export const USED_KEY = 'aqua-identity.oauth-used.v1'

export async function issuePendingOAuth(input: {
  identifier: string
  expectedDid: string
  handle: string
  pdsUrl: string
  now: number
  ttlMs: number
}): Promise<PendingOAuth> {
  const codeVerifier = createCodeVerifier()
  const codeChallenge = await createCodeChallenge(codeVerifier)
  return {
    state: createOAuthState(),
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
    createdAt: input.now,
    expiresAt: input.now + input.ttlMs,
    identifier: input.identifier,
    expectedDid: input.expectedDid,
    handle: input.handle,
    pdsUrl: input.pdsUrl,
  }
}

function readUsed(storage: KeyValueStore): string[] {
  const raw = storage.get(USED_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export function savePending(storage: KeyValueStore, pending: PendingOAuth) {
  storage.set(PENDING_KEY, JSON.stringify(pending))
}

export function loadPending(storage: KeyValueStore): PendingOAuth | undefined {
  const raw = storage.get(PENDING_KEY)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as PendingOAuth
    if (!parsed?.state || !parsed.codeVerifier || !parsed.expectedDid) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

export type PendingConsume =
  | {ok: true; pending: PendingOAuth}
  | {
      ok: false
      reason:
        | 'state-missing'
        | 'state-mismatch'
        | 'state-expired'
        | 'state-reused'
    }

/**
 * Single-use state. A mismatched callback does not burn the pending login,
 * so a stray request cannot invalidate the real redirect.
 */
export function consumePending(
  storage: KeyValueStore,
  state: string | undefined,
  now: number,
): PendingConsume {
  if (!state) return {ok: false, reason: 'state-missing'}
  const used = readUsed(storage)
  if (used.includes(state)) return {ok: false, reason: 'state-reused'}
  const pending = loadPending(storage)
  if (!pending) return {ok: false, reason: 'state-missing'}
  if (pending.state !== state) return {ok: false, reason: 'state-mismatch'}
  if (now > pending.expiresAt) {
    storage.remove(PENDING_KEY)
    return {ok: false, reason: 'state-expired'}
  }
  storage.remove(PENDING_KEY)
  used.push(state)
  storage.set(USED_KEY, JSON.stringify(used.slice(-20)))
  return {ok: true, pending}
}
