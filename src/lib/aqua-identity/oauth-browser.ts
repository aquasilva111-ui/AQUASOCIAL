import {readEphemeralPdsSession} from './accounts'
import {postAuthedXrpc} from './pds'
import {currentIdentity} from './runtime'
import {sessionBrowserStore} from './storage'
import {type PendingOAuth} from './types'

export type IdentityActionResult =
  | {ok: true; redirected?: true}
  | {ok: false; reason: string; message?: string}

/**
 * Native builds do not ship the browser OAuth client. The static site does.
 * Bearer calls for an own-PDS session still work when the tab holds a JWT.
 */
export async function beginPublicOAuth(
  _pending: PendingOAuth,
): Promise<IdentityActionResult> {
  return {ok: false, reason: 'public-oauth-web-only'}
}

export async function completePublicOAuth(
  _currentUrl: string,
): Promise<IdentityActionResult> {
  return {ok: false, reason: 'public-oauth-web-only'}
}

export function resetPublicOAuthAttempt() {}

export async function runIdentityProcedure(input: {
  nsid: string
  body?: Record<string, unknown>
}): Promise<IdentityActionResult> {
  const account = currentIdentity()
  const ephemeral = readEphemeralPdsSession(sessionBrowserStore())
  if (
    !account ||
    account.method !== 'pds-session' ||
    !ephemeral ||
    ephemeral.did !== account.did
  ) {
    return {ok: false, reason: 'session-required'}
  }
  return postAuthedXrpc({
    pdsUrl: account.pdsUrl,
    nsid: input.nsid,
    accessJwt: ephemeral.accessJwt,
    body: input.body,
    fetch: globalThis.fetch.bind(globalThis),
  })
}
