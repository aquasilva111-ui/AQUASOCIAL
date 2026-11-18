import {BrowserOAuthClient} from '@atproto/oauth-client-browser'
import {type OAuthClientMetadataInput} from '@atproto/oauth-types'

import {readEphemeralPdsSession} from './accounts'
import {readAquaIdentityConfig} from './config'
import {finalizeOAuthSignIn, readOAuthCallback} from './flow'
import {selectClientMetadata} from './metadata'
import {postAuthedXrpc, redactSecrets} from './pds'
import {savePending} from './pending'
import {reasonText} from './reasons'
import {currentIdentity, rememberAccount} from './runtime'
import {sessionBrowserStore} from './storage'
import {type PendingOAuth, type PublicClientMetadata} from './types'

export type IdentityActionResult =
  | {ok: true; redirected?: true}
  | {ok: false; reason: string; message?: string}

let clientPromise: Promise<BrowserOAuthClient> | undefined
let completePromise: Promise<IdentityActionResult> | undefined

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactSecrets(raw).slice(0, 240)
}

async function loadClient(
  metadata: PublicClientMetadata | undefined,
): Promise<BrowserOAuthClient> {
  if (!clientPromise) {
    const config = readAquaIdentityConfig()
    clientPromise = Promise.resolve(
      new BrowserOAuthClient({
        handleResolver: config.handleResolver,
        clientMetadata: metadata as OAuthClientMetadataInput | undefined,
        responseMode: 'fragment',
        plcDirectoryUrl: config.plcDirectoryUrl,
      }),
    )
  }
  return clientPromise
}

export function resetPublicOAuthAttempt() {
  completePromise = undefined
}

export async function beginPublicOAuth(
  pending: PendingOAuth,
): Promise<IdentityActionResult> {
  const config = readAquaIdentityConfig()
  const origin = typeof location === 'undefined' ? undefined : location.origin
  const metadata = selectClientMetadata(config, origin)
  if (metadata === 'unconfigured') {
    return {ok: false, reason: 'client-metadata-unconfigured'}
  }
  savePending(sessionBrowserStore(), pending)
  try {
    const client = await loadClient(metadata)
    await client.signInRedirect(pending.identifier, {state: pending.state})
    return {ok: true, redirected: true}
  } catch (error) {
    return {
      ok: false,
      reason: 'oauth-start-failed',
      message: safeErrorMessage(error),
    }
  }
}

async function completeOnce(currentUrl: string): Promise<IdentityActionResult> {
  const callback = readOAuthCallback(currentUrl)
  if (!callback.code && !callback.error && !callback.state) {
    return {ok: false, reason: 'no-session'}
  }
  const config = readAquaIdentityConfig()
  const origin = typeof location === 'undefined' ? undefined : location.origin
  const metadata = selectClientMetadata(config, origin)
  if (metadata === 'unconfigured') {
    return {ok: false, reason: 'client-metadata-unconfigured'}
  }
  try {
    const client = await loadClient(metadata)
    const params = new URLSearchParams()
    if (callback.code) params.set('code', callback.code)
    if (callback.state) params.set('state', callback.state)
    if (callback.iss) params.set('iss', callback.iss)
    if (callback.error) params.set('error', callback.error)
    if (callback.errorDescription) {
      params.set('error_description', callback.errorDescription)
    }
    const result = await client.initCallback(params, client.findRedirectUrl())
    const finalized = await finalizeOAuthSignIn({
      storage: sessionBrowserStore(),
      callbackUrl: currentUrl,
      sessionDid: result.session.sub,
      returnedState: result.state,
    })
    if (!finalized.ok) {
      try {
        await result.session.signOut()
      } catch {
        // The account is still refused when state, PKCE, or DID do not match.
      }
      return finalized
    }
    rememberAccount(finalized.account)
    return {ok: true}
  } catch (error) {
    return {
      ok: false,
      reason: callback.error ? 'oauth-error' : 'oauth-callback-failed',
      message: callback.errorDescription || safeErrorMessage(error),
    }
  }
}

export function completePublicOAuth(
  currentUrl: string,
): Promise<IdentityActionResult> {
  if (!completePromise) completePromise = completeOnce(currentUrl)
  return completePromise
}

export async function runIdentityProcedure(input: {
  nsid: string
  body?: Record<string, unknown>
}): Promise<IdentityActionResult> {
  const account = currentIdentity()
  if (!account) return {ok: false, reason: 'session-required'}
  if (account.method === 'pds-session') {
    const ephemeral = readEphemeralPdsSession(sessionBrowserStore())
    if (!ephemeral || ephemeral.did !== account.did) {
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
  try {
    const config = readAquaIdentityConfig()
    const origin = typeof location === 'undefined' ? undefined : location.origin
    const metadata = selectClientMetadata(config, origin)
    if (metadata === 'unconfigured') {
      return {ok: false, reason: 'client-metadata-unconfigured'}
    }
    const client = await loadClient(metadata)
    const session = await client.restore(account.did)
    const response = await session.fetchHandler(`/xrpc/${input.nsid}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: input.body ? JSON.stringify(input.body) : undefined,
    })
    if (!response.ok) {
      const text = await response.text()
      return {
        ok: false,
        reason: 'pds-rejected',
        message: redactSecrets(text).slice(0, 240),
      }
    }
    return {ok: true}
  } catch (error) {
    return {
      ok: false,
      reason: 'oauth-callback-failed',
      message: safeErrorMessage(error) || reasonText('session-required'),
    }
  }
}
