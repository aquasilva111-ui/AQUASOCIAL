import {assessAbuse} from './abuse'
import {signupAvailability} from './config'
import {formatAquaHandle, nativeHandleOnDomain} from './handles'
import {type SlidingWindowRateLimiter} from './rate-limit'
import {
  type AquaIdentityAccount,
  type AquaIdentityConfig,
  type Failure,
} from './types'

type FetchLike = typeof fetch

export type CreateAccountInput = {
  email: string
  password: string
  localHandle: string
  inviteCode?: string
  captchaToken?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type PdsHealth =
  | {ok: true; version: string}
  | {ok: false; reason: 'pds-unset' | 'pds-unhealthy' | 'pds-unreachable'}

/**
 * GET {pdsUrl}/xrpc/_health. The signup form stays hidden until this returns
 * a JSON body with a non-empty version string.
 */
export async function checkPdsHealth(input: {
  pdsUrl: string
  fetch: FetchLike
}): Promise<PdsHealth> {
  const base = input.pdsUrl.trim().replace(/\/$/, '')
  if (!base) return {ok: false, reason: 'pds-unset'}
  let response: Response
  try {
    response = await input.fetch(`${base}/xrpc/_health`, {
      method: 'GET',
      headers: {accept: 'application/json'},
    })
  } catch {
    return {ok: false, reason: 'pds-unreachable'}
  }
  if (!response.ok) return {ok: false, reason: 'pds-unhealthy'}
  try {
    const body = (await response.json()) as {version?: unknown}
    if (typeof body.version !== 'string' || body.version.trim() === '') {
      return {ok: false, reason: 'pds-unhealthy'}
    }
    return {ok: true, version: body.version.trim()}
  } catch {
    return {ok: false, reason: 'pds-unhealthy'}
  }
}

/**
 * The form is shown only when the flag, the PDS URL, the handle domain and
 * a healthy `/xrpc/_health` are all present. Default config hides it.
 */
export function nativeSignupOffer(input: {
  config: AquaIdentityConfig
  health?: PdsHealth
}):
  | {showForm: true; pdsUrl: string; version: string}
  | {showForm: false; reason: string} {
  const gate = signupAvailability(input.config)
  if (!gate.enabled) return {showForm: false, reason: gate.reason}
  if (!input.config.handleDomain) {
    return {showForm: false, reason: 'handle-domain-unset'}
  }
  if (!input.health) return {showForm: false, reason: 'pds-health-pending'}
  if (!input.health.ok) return {showForm: false, reason: input.health.reason}
  return {showForm: true, pdsUrl: gate.pdsUrl, version: input.health.version}
}

export function redactSecrets(value: string): string {
  return value
    .replace(/("password"\s*:\s*")[^"]*/gi, '$1[redacted]')
    .replace(/(password=)[^\s&"]*/gi, '$1[redacted]')
}

/**
 * com.atproto.server.createAccount against the configured AQUA PDS.
 * The password is sent once to that PDS and is not returned or stored.
 * When the flag is off, fetch is never called.
 */
export async function createNativeAccount(input: {
  config: AquaIdentityConfig
  account: CreateAccountInput
  limiter: SlidingWindowRateLimiter
  fetch: FetchLike
}): Promise<
  | {
      ok: true
      account: AquaIdentityAccount
      ephemeral?: {accessJwt: string; refreshJwt?: string}
    }
  | Failure
> {
  const gate = signupAvailability(input.config)
  if (!gate.enabled) return {ok: false, reason: gate.reason}
  const abuse = assessAbuse(input.config, input.account)
  if (!abuse.ok) return abuse
  if (!EMAIL_RE.test(input.account.email.trim())) {
    return {ok: false, reason: 'invalid-email'}
  }
  if (input.account.password.length < 8) {
    return {ok: false, reason: 'password-too-short'}
  }
  const handle = formatAquaHandle(
    input.account.localHandle,
    input.config.handleDomain,
  )
  if (!handle.ok) return handle
  const onDomain = nativeHandleOnDomain(
    handle.handle,
    input.config.handleDomain,
  )
  if (!onDomain.ok) return onDomain
  const limited = input.limiter.consume('register', input.account.email)
  if (!limited.ok) return {ok: false, reason: limited.reason}

  const body: Record<string, string> = {
    email: input.account.email.trim(),
    password: input.account.password,
    handle: onDomain.handle,
  }
  if (input.account.inviteCode?.trim())
    body.inviteCode = input.account.inviteCode.trim()

  let response: Response
  try {
    response = await input.fetch(
      `${gate.pdsUrl}/xrpc/com.atproto.server.createAccount`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
  } catch {
    return {ok: false, reason: 'pds-unreachable'}
  }

  const text = await response.text()
  if (!response.ok) {
    return {
      ok: false,
      reason: 'pds-rejected',
      message: redactSecrets(text).slice(0, 240),
    }
  }
  let parsed: {
    did?: string
    handle?: string
    accessJwt?: string
    refreshJwt?: string
  }
  try {
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    return {ok: false, reason: 'pds-rejected'}
  }
  if (!parsed.did || !parsed.handle) return {ok: false, reason: 'pds-rejected'}
  const account: AquaIdentityAccount = {
    did: parsed.did,
    handle: parsed.handle,
    pdsUrl: gate.pdsUrl,
    method: 'pds-session',
    email: input.account.email.trim(),
    emailConfirmed: false,
  }
  return {
    ok: true,
    account,
    ...(parsed.accessJwt
      ? {
          ephemeral: {
            accessJwt: parsed.accessJwt,
            refreshJwt: parsed.refreshJwt,
          },
        }
      : {}),
  }
}

export async function requestOwnPdsPasswordReset(input: {
  config: AquaIdentityConfig
  email: string
  limiter: SlidingWindowRateLimiter
  fetch: FetchLike
}): Promise<{ok: true} | Failure> {
  if (!input.config.pdsUrl) return {ok: false, reason: 'pds-unset'}
  if (!EMAIL_RE.test(input.email.trim()))
    return {ok: false, reason: 'invalid-email'}
  const limited = input.limiter.consume('recovery', input.email)
  if (!limited.ok) return {ok: false, reason: limited.reason}
  return postNoStore(
    input.fetch,
    input.config.pdsUrl,
    'com.atproto.server.requestPasswordReset',
    {
      email: input.email.trim(),
    },
  )
}

export async function resetOwnPdsPassword(input: {
  config: AquaIdentityConfig
  token: string
  password: string
  limiter: SlidingWindowRateLimiter
  fetch: FetchLike
}): Promise<{ok: true} | Failure> {
  if (!input.config.pdsUrl) return {ok: false, reason: 'pds-unset'}
  if (!input.token.trim()) return {ok: false, reason: 'reset-token-required'}
  if (input.password.length < 8)
    return {ok: false, reason: 'password-too-short'}
  const limited = input.limiter.consume('recovery', input.token)
  if (!limited.ok) return {ok: false, reason: limited.reason}
  const result = await postNoStore(
    input.fetch,
    input.config.pdsUrl,
    'com.atproto.server.resetPassword',
    {token: input.token.trim(), password: input.password},
  )
  return result
}

export async function postAuthedXrpc(input: {
  pdsUrl: string
  nsid: string
  accessJwt: string
  body?: Record<string, unknown>
  fetch: FetchLike
}): Promise<{ok: true} | Failure> {
  try {
    const response = await input.fetch(`${input.pdsUrl}/xrpc/${input.nsid}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${input.accessJwt}`,
      },
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
  } catch {
    return {ok: false, reason: 'pds-unreachable'}
  }
}

async function postNoStore(
  fetchImpl: FetchLike,
  pdsUrl: string,
  nsid: string,
  body: Record<string, string>,
): Promise<{ok: true} | Failure> {
  try {
    const response = await fetchImpl(`${pdsUrl}/xrpc/${nsid}`, {
      method: 'POST',
      headers: {'content-type': 'application/json', accept: 'application/json'},
      body: JSON.stringify(body),
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
  } catch {
    return {ok: false, reason: 'pds-unreachable'}
  }
}
