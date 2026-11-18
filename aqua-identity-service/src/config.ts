import {fileURLToPath} from 'node:url'

export type GoogleConfig = {
  clientId: string
  clientSecret: string
  issuer: string
}

export type AppleConfig = {
  clientId: string
  teamId: string
  keyId: string
  privateKeyPem: string
  issuer: string
}

export type GithubConfig = {
  clientId: string
  clientSecret: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userEndpoint: string
}

export type EmailConfig = {
  from: string
  transport: 'capture' | 'smtp'
  smtpUrl?: string
}

export type AtprotoClient = {
  clientMetadata: unknown
  jwks: unknown
  authorize: (handle: string, options: {state: string}) => Promise<URL | string>
  callback: (params: URLSearchParams) => Promise<{
    session: {did: string}
    state?: string | null
  }>
  revoke: (did: string) => Promise<void>
}

export type LimitWindow = {limit: number; windowMs: number}

export type ServiceConfig = {
  origin: string
  appOrigins: string[]
  databasePath: string
  sessionSecret: string
  secureCookies: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
  allowInsecure: boolean
  reauthWindowMs: number
  sessionTtlSeconds: number
  stateTtlMs: number
  emailCodeTtlMs: number
  port: number
  host: string
  dohUrl: string
  handleResolver: string
  privateKeys: string
  passwordLogin: boolean
  trustProxy: boolean
  google?: GoogleConfig
  apple?: AppleConfig
  github?: GithubConfig
  email?: EmailConfig
  atprotoEnabled: boolean
  atprotoClient?: AtprotoClient
  fetch: typeof fetch
  now: () => number
  limits: {
    oauthStart: LimitWindow
    emailStart: LimitWindow
    emailFinish: LimitWindow
    password: LimitWindow
  }
}

export type PublicDirectory = {
  providers: string[]
  atproto: boolean
  password: boolean
}

const FIFTEEN_MINUTES = 15 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000
const GOOGLE_ISSUER = 'https://accounts.google.com'
const APPLE_ISSUER = 'https://appleid.apple.com'
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token'
const GITHUB_USER = 'https://api.github.com/user'

function read(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? '').trim()
}

function flag(value: string): boolean {
  return value === 'true' || value === '1'
}

function pem(value: string): string {
  return value.replace(/\\n/g, '\n')
}

export function publicDirectory(config: ServiceConfig): PublicDirectory {
  const providers: string[] = []
  if (config.google) providers.push('google')
  if (config.apple) providers.push('apple')
  if (config.github) providers.push('github')
  if (config.email) providers.push('email')
  if (config.passwordLogin) providers.push('password')
  return {
    providers,
    atproto: config.atprotoEnabled || Boolean(config.atprotoClient),
    password: config.passwordLogin,
  }
}

function httpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    return url
  } catch {
    return undefined
  }
}

function endpoint(
  value: string,
  fallback: string,
  allowHttp: boolean,
): string | undefined {
  const candidate = value || fallback
  const url = httpsUrl(candidate)
  if (!url) return undefined
  if (url.protocol === 'http:' && !allowHttp) return undefined
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  return url.toString().replace(/\/$/, '')
}

function parseOrigins(value: string, allowHttp: boolean): string[] | undefined {
  const origins = value
    .split(',')
    .map(item => item.trim().replace(/\/$/, ''))
    .filter(Boolean)
  const parsed: string[] = []
  for (const origin of origins) {
    const url = httpsUrl(origin)
    if (!url || url.origin !== origin) return undefined
    if (url.protocol === 'https:') {
      parsed.push(url.origin)
      continue
    }
    if (url.protocol === 'http:' && allowHttp) {
      parsed.push(url.origin)
      continue
    }
    return undefined
  }
  return parsed
}

export type ConfigResult =
  | {ok: true; config: ServiceConfig}
  | {ok: false; reason: string}

/**
 * Secrets stay in this process. A provider is absent from the public directory
 * until every required value is set. HTTP issuers are ignored unless the
 * explicit insecure flag is on, and that flag is refused in production.
 */
export function readServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConfigResult {
  const production = env.NODE_ENV === 'production'
  const allowInsecure = flag(read(env, 'AQUA_IDENTITY_OAUTH_ALLOW_INSECURE'))
  if (production && allowInsecure) {
    return {
      ok: false,
      reason: 'AQUA_IDENTITY_OAUTH_ALLOW_INSECURE cannot be set in production',
    }
  }
  const origin = read(env, 'AQUA_IDENTITY_ORIGIN').replace(/\/$/, '')
  if (!origin.startsWith('https://')) {
    return {ok: false, reason: 'AQUA_IDENTITY_ORIGIN must be https'}
  }
  const sessionSecret = read(env, 'AQUA_IDENTITY_SESSION_SECRET')
  if (sessionSecret.length < 32) {
    return {
      ok: false,
      reason: 'AQUA_IDENTITY_SESSION_SECRET must be at least 32 characters',
    }
  }
  const appOrigins = parseOrigins(
    read(env, 'AQUA_IDENTITY_APP_ORIGINS'),
    allowInsecure,
  )
  if (!appOrigins || appOrigins.length === 0) {
    return {
      ok: false,
      reason: 'AQUA_IDENTITY_APP_ORIGINS must list at least one https origin',
    }
  }
  const sameSiteRaw = read(env, 'AQUA_IDENTITY_COOKIE_SAMESITE').toLowerCase()
  const sameSite =
    sameSiteRaw === 'none' || sameSiteRaw === 'strict' ? sameSiteRaw : 'lax'
  const normalizedSameSite = (
    sameSite === 'none' ? 'None' : sameSite === 'strict' ? 'Strict' : 'Lax'
  ) as ServiceConfig['sameSite']
  if (normalizedSameSite === 'None') {
    return {
      ok: false,
      reason:
        'SameSite=None is not enabled. Keep Lax and put the service on the same site as the app, or front it with HTTPS before using None.',
    }
  }

  const googleId = read(env, 'AQUA_IDENTITY_GOOGLE_CLIENT_ID')
  const googleSecret = read(env, 'AQUA_IDENTITY_GOOGLE_CLIENT_SECRET')
  const googleIssuer = endpoint(
    read(env, 'AQUA_IDENTITY_GOOGLE_ISSUER'),
    GOOGLE_ISSUER,
    allowInsecure,
  )
  const google =
    googleId && googleSecret && googleIssuer
      ? {clientId: googleId, clientSecret: googleSecret, issuer: googleIssuer}
      : undefined

  const appleId = read(env, 'AQUA_IDENTITY_APPLE_CLIENT_ID')
  const appleTeam = read(env, 'AQUA_IDENTITY_APPLE_TEAM_ID')
  const appleKey = read(env, 'AQUA_IDENTITY_APPLE_KEY_ID')
  const applePem = pem(read(env, 'AQUA_IDENTITY_APPLE_PRIVATE_KEY'))
  const appleIssuer = endpoint(
    read(env, 'AQUA_IDENTITY_APPLE_ISSUER'),
    APPLE_ISSUER,
    allowInsecure,
  )
  const apple =
    appleId && appleTeam && appleKey && applePem && appleIssuer
      ? {
          clientId: appleId,
          teamId: appleTeam,
          keyId: appleKey,
          privateKeyPem: applePem,
          issuer: appleIssuer,
        }
      : undefined

  const githubId = read(env, 'AQUA_IDENTITY_GITHUB_CLIENT_ID')
  const githubSecret = read(env, 'AQUA_IDENTITY_GITHUB_CLIENT_SECRET')
  const githubAuthorize = endpoint(
    read(env, 'AQUA_IDENTITY_GITHUB_AUTHORIZATION_ENDPOINT'),
    GITHUB_AUTHORIZE,
    allowInsecure,
  )
  const githubToken = endpoint(
    read(env, 'AQUA_IDENTITY_GITHUB_TOKEN_ENDPOINT'),
    GITHUB_TOKEN,
    allowInsecure,
  )
  const githubUser = endpoint(
    read(env, 'AQUA_IDENTITY_GITHUB_USER_ENDPOINT'),
    GITHUB_USER,
    allowInsecure,
  )
  const github =
    githubId && githubSecret && githubAuthorize && githubToken && githubUser
      ? {
          clientId: githubId,
          clientSecret: githubSecret,
          authorizationEndpoint: githubAuthorize,
          tokenEndpoint: githubToken,
          userEndpoint: githubUser,
        }
      : undefined

  const emailFrom = read(env, 'AQUA_IDENTITY_EMAIL_FROM')
  const emailTransport = read(env, 'AQUA_IDENTITY_EMAIL_TRANSPORT')
  const smtpUrl = read(env, 'AQUA_IDENTITY_SMTP_URL')
  let email: EmailConfig | undefined
  if (emailFrom && emailTransport === 'smtp' && smtpUrl) {
    email = {from: emailFrom, transport: 'smtp', smtpUrl}
  } else if (emailFrom && emailTransport === 'capture') {
    if (production) {
      return {
        ok: false,
        reason:
          'AQUA_IDENTITY_EMAIL_TRANSPORT=capture is refused in production',
      }
    }
    email = {from: emailFrom, transport: 'capture'}
  }

  const privateKeys = read(env, 'AQUA_IDENTITY_PRIVATE_KEYS')
  const databasePath =
    read(env, 'AQUA_IDENTITY_DATABASE_PATH') ||
    fileURLToPath(new URL('../data/identity.sqlite', import.meta.url))
  const reauthSeconds = Number(
    read(env, 'AQUA_IDENTITY_REAUTH_WINDOW_SECONDS') || '600',
  )

  return {
    ok: true,
    config: {
      origin,
      appOrigins,
      databasePath,
      sessionSecret,
      secureCookies: true,
      sameSite: normalizedSameSite,
      allowInsecure,
      reauthWindowMs:
        Number.isFinite(reauthSeconds) && reauthSeconds > 0
          ? reauthSeconds * 1000
          : 600_000,
      sessionTtlSeconds: 7 * 24 * 60 * 60,
      stateTtlMs: 10 * 60 * 1000,
      emailCodeTtlMs: FIFTEEN_MINUTES,
      port: Number(read(env, 'AQUA_IDENTITY_PORT') || '8787'),
      host: read(env, 'AQUA_IDENTITY_HOST') || '127.0.0.1',
      dohUrl:
        read(env, 'AQUA_IDENTITY_DOH_URL') ||
        'https://cloudflare-dns.com/dns-query',
      handleResolver:
        read(env, 'AQUA_IDENTITY_HANDLE_RESOLVER') || 'https://bsky.social',
      privateKeys,
      passwordLogin: flag(read(env, 'AQUA_IDENTITY_PASSWORD_LOGIN')),
      trustProxy: flag(read(env, 'AQUA_IDENTITY_TRUST_PROXY')),
      google,
      apple,
      github,
      email,
      atprotoEnabled: privateKeys.length > 0,
      fetch: globalThis.fetch.bind(globalThis),
      now: () => Date.now(),
      limits: {
        oauthStart: {limit: 5, windowMs: FIFTEEN_MINUTES},
        emailStart: {limit: 3, windowMs: ONE_HOUR},
        emailFinish: {limit: 8, windowMs: FIFTEEN_MINUTES},
        password: {limit: 5, windowMs: FIFTEEN_MINUTES},
      },
    },
  }
}
