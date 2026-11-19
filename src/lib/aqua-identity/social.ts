export const SOCIAL_BUTTONS = [
  'google',
  'apple',
  'github',
  'email',
  'password',
] as const

export type SocialButton = (typeof SOCIAL_BUTTONS)[number]

export type SocialDirectory = {
  providers: SocialButton[]
  atproto: boolean
}

const OAUTH_BUTTONS = ['google', 'apple', 'github'] as const
export type SocialOAuthButton = (typeof OAUTH_BUTTONS)[number]

export function emptySocialDirectory(): SocialDirectory {
  return {providers: [], atproto: false}
}

/**
 * Keeps only providers the server says are configured.
 * Anything else in the payload, including a secret, is dropped.
 */
export function parseSocialDirectory(value: unknown): SocialDirectory {
  if (!value || typeof value !== 'object') return emptySocialDirectory()
  const body = value as {providers?: unknown; atproto?: unknown}
  const listed = new Set(Array.isArray(body.providers) ? body.providers : [])
  return {
    providers: SOCIAL_BUTTONS.filter(name => listed.has(name)),
    atproto: body.atproto === true,
  }
}

export async function loadSocialDirectory(
  serviceUrl: string,
  fetchImpl: typeof fetch,
): Promise<SocialDirectory> {
  if (!serviceUrl) return emptySocialDirectory()
  try {
    const response = await fetchImpl(new URL('/providers', serviceUrl), {
      headers: {accept: 'application/json'},
    })
    if (!response.ok) return emptySocialDirectory()
    return parseSocialDirectory(await response.json())
  } catch {
    return emptySocialDirectory()
  }
}

export function socialAuthorizeUrl(
  serviceUrl: string,
  provider: SocialOAuthButton,
  intent: 'login' | 'link',
  csrf?: string,
): string {
  const url = new URL('/oauth/social/start', serviceUrl)
  url.searchParams.set('provider', provider)
  url.searchParams.set('intent', intent)
  if (csrf) url.searchParams.set('csrf', csrf)
  return url.toString()
}

export function atprotoServiceLoginUrl(
  serviceUrl: string,
  identifier: string,
): string {
  const url = new URL('/login', serviceUrl)
  url.searchParams.set('handle', identifier.trim())
  return url.toString()
}

export function readSocialError(search: string): string {
  const code = new URLSearchParams(search).get('social_error') ?? ''
  if (!/^[a-z0-9-]{1,64}$/.test(code)) return ''
  return code
}

export type ServiceSessionView = {
  authenticated?: boolean
  csrfToken?: string
  reauthFresh?: boolean
  authorization?: {userId: string; did: string | null} | null
  user?: {handle: string | null}
  identities?: {provider: string}[]
}

export async function loadServiceSession(
  serviceUrl: string,
  fetchImpl: typeof fetch,
): Promise<ServiceSessionView | undefined> {
  if (!serviceUrl) return undefined
  try {
    const response = await fetchImpl(new URL('/session', serviceUrl), {
      credentials: 'include',
      headers: {accept: 'application/json'},
    })
    if (!response.ok) return undefined
    return (await response.json()) as ServiceSessionView
  } catch {
    return undefined
  }
}

export async function postIdentityService(
  serviceUrl: string,
  path: string,
  body: Record<string, string>,
  csrf?: string,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<{ok: boolean; status: number; reason: string}> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-aqua-client': 'aqua-identity',
  }
  if (csrf) headers['x-aqua-csrf'] = csrf
  const response = await fetchImpl(new URL(path, serviceUrl), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  })
  let reason = ''
  try {
    const parsed = (await response.json()) as {error?: unknown}
    if (typeof parsed.error === 'string') reason = parsed.error
  } catch {
    reason = ''
  }
  return {ok: response.ok, status: response.status, reason}
}
