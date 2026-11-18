import {consumePending} from './pending'
import {issuePendingOAuth} from './pending'
import {createCodeChallenge} from './pkce'
import {type SlidingWindowRateLimiter} from './rate-limit'
import {resolveIdentity} from './resolve'
import {type KeyValueStore} from './storage'
import {
  type AquaIdentityAccount,
  type AquaIdentityConfig,
  type Failure,
  type OAuthCallbackParams,
  type PendingOAuth,
} from './types'

export async function prepareOAuthSignIn(input: {
  identifier: string
  config: AquaIdentityConfig
  limiter: SlidingWindowRateLimiter
  fetch: typeof fetch
  now?: number
}): Promise<{ok: true; pending: PendingOAuth} | Failure> {
  const now = input.now ?? Date.now()
  const limited = input.limiter.consume('login', input.identifier)
  if (!limited.ok) return {ok: false, reason: limited.reason}
  const resolved = await resolveIdentity(
    input.identifier,
    input.config,
    input.fetch,
  )
  if (!resolved.ok) return resolved
  const pending = await issuePendingOAuth({
    identifier: resolved.identity.did,
    expectedDid: resolved.identity.did,
    handle: resolved.identity.handle ?? '',
    pdsUrl: resolved.identity.pdsUrl,
    now,
    ttlMs: input.config.stateTtlMs,
  })
  return {ok: true, pending}
}

export function readOAuthCallback(url: string): OAuthCallbackParams {
  let parsed: URL
  try {
    parsed = new URL(url, 'https://aqua.invalid')
  } catch {
    return {}
  }
  const query = parsed.searchParams
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''))
  const pick = (key: string) => hash.get(key) ?? query.get(key) ?? undefined
  return {
    code: pick('code') ?? undefined,
    state: pick('state') ?? undefined,
    error: pick('error') ?? undefined,
    errorDescription: pick('error_description') ?? undefined,
    iss: pick('iss') ?? undefined,
  }
}

/**
 * Accepts an OAuth return only when state, PKCE, and the pre-resolved DID agree.
 * The SDK still performs its own PKCE and DPoP against the PDS. This check stops
 * AQUA from linking a DID the user did not ask to sign in.
 */
export async function finalizeOAuthSignIn(input: {
  storage: KeyValueStore
  callbackUrl: string
  sessionDid: string
  returnedState?: string | null
  now?: number
}): Promise<{ok: true; account: AquaIdentityAccount} | Failure> {
  const now = input.now ?? Date.now()
  const callback = readOAuthCallback(input.callbackUrl)
  if (callback.error) {
    return {ok: false, reason: 'oauth-error', message: callback.error}
  }
  if (!callback.code) return {ok: false, reason: 'missing-code'}
  const state = callback.state ?? input.returnedState ?? undefined
  if (
    input.returnedState &&
    callback.state &&
    input.returnedState !== callback.state
  ) {
    return {ok: false, reason: 'state-mismatch'}
  }
  const consumed = consumePending(input.storage, state ?? undefined, now)
  if (!consumed.ok) return consumed
  const challenge = await createCodeChallenge(consumed.pending.codeVerifier)
  if (challenge !== consumed.pending.codeChallenge) {
    return {ok: false, reason: 'pkce-mismatch'}
  }
  if (consumed.pending.expectedDid !== input.sessionDid) {
    return {ok: false, reason: 'did-mismatch'}
  }
  return {
    ok: true,
    account: {
      did: input.sessionDid,
      handle: consumed.pending.handle,
      pdsUrl: consumed.pending.pdsUrl,
      method: 'oauth',
    },
  }
}
