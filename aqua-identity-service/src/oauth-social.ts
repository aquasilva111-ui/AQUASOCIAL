import * as oidc from 'openid-client'

import {appleClientSecret} from './apple.ts'
import {
  type AppleConfig,
  type GithubConfig,
  type GoogleConfig,
  type ServiceConfig,
} from './config.ts'
import {type OauthTransactionRow} from './db.ts'
import {normalizeEmail} from './users.ts'

export type VerifiedSocialIdentity = {
  provider: 'google' | 'apple' | 'github'
  subject: string
  email: string | null
}

const googleCache = new WeakMap<ServiceConfig, Promise<oidc.Configuration>>()
const appleMetadata = new WeakMap<ServiceConfig, oidc.ServerMetadata>()

function discoveryOptions(config: ServiceConfig): oidc.DiscoveryRequestOptions {
  const execute: Array<(config: oidc.Configuration) => void> = [
    oidc.enableNonRepudiationChecks,
  ]
  if (config.allowInsecure) execute.unshift(oidc.allowInsecureRequests)
  return {timeout: 10, execute}
}

function protectConfiguration(
  config: ServiceConfig,
  configuration: oidc.Configuration,
) {
  oidc.enableNonRepudiationChecks(configuration)
  if (config.allowInsecure) oidc.allowInsecureRequests(configuration)
  configuration.timeout = 10
  return configuration
}

async function googleConfiguration(
  config: ServiceConfig,
  google: GoogleConfig,
): Promise<oidc.Configuration> {
  let pending = googleCache.get(config)
  if (!pending) {
    pending = oidc.discovery(
      new URL(google.issuer),
      google.clientId,
      google.clientSecret,
      oidc.ClientSecretPost(google.clientSecret),
      discoveryOptions(config),
    )
    googleCache.set(config, pending)
    pending.catch(() => {
      googleCache.delete(config)
    })
  }
  return pending
}

async function appleConfiguration(
  config: ServiceConfig,
  apple: AppleConfig,
): Promise<oidc.Configuration> {
  const secret = appleClientSecret({
    teamId: apple.teamId,
    clientId: apple.clientId,
    keyId: apple.keyId,
    privateKeyPem: apple.privateKeyPem,
    now: Math.floor(config.now() / 1000),
  })
  let metadata = appleMetadata.get(config)
  if (!metadata) {
    const discovered = await oidc.discovery(
      new URL(apple.issuer),
      apple.clientId,
      secret,
      oidc.ClientSecretPost(secret),
      discoveryOptions(config),
    )
    metadata = discovered.serverMetadata()
    appleMetadata.set(config, metadata)
  }
  return protectConfiguration(
    config,
    new oidc.Configuration(
      metadata,
      apple.clientId,
      secret,
      oidc.ClientSecretPost(secret),
    ),
  )
}

function githubConfiguration(
  config: ServiceConfig,
  github: GithubConfig,
): oidc.Configuration {
  const configuration = new oidc.Configuration(
    {
      issuer: 'https://github.com',
      authorization_endpoint: github.authorizationEndpoint,
      token_endpoint: github.tokenEndpoint,
    },
    github.clientId,
    github.clientSecret,
    oidc.ClientSecretPost(github.clientSecret),
  )
  if (config.allowInsecure) oidc.allowInsecureRequests(configuration)
  configuration.timeout = 10
  return configuration
}

async function configurationFor(
  config: ServiceConfig,
  provider: 'google' | 'apple' | 'github',
): Promise<oidc.Configuration> {
  if (provider === 'google') {
    if (!config.google) throw new Error('provider-disabled')
    return googleConfiguration(config, config.google)
  }
  if (provider === 'apple') {
    if (!config.apple) throw new Error('provider-disabled')
    return appleConfiguration(config, config.apple)
  }
  if (!config.github) throw new Error('provider-disabled')
  return githubConfiguration(config, config.github)
}

export function newCodeVerifier(): string {
  return oidc.randomPKCECodeVerifier()
}

export function newNonce(): string {
  return oidc.randomNonce()
}

/**
 * Authorization code + PKCE + state. Google and Apple also send a nonce.
 * The redirect URI is the one the caller already fixed. It is not taken from
 * the browser.
 */
export async function buildSocialAuthorization(
  config: ServiceConfig,
  provider: 'google' | 'apple' | 'github',
  transaction: {
    state: string
    codeVerifier: string
    nonce: string | null
    redirectUri: string
  },
): Promise<URL> {
  const configuration = await configurationFor(config, provider)
  const parameters: Record<string, string> = {
    redirect_uri: transaction.redirectUri,
    state: transaction.state,
    code_challenge: await oidc.calculatePKCECodeChallenge(
      transaction.codeVerifier,
    ),
    code_challenge_method: 'S256',
    scope:
      provider === 'github' ? 'read:user user:email' : 'openid email profile',
  }
  if (provider === 'apple') {
    parameters.scope = 'openid email name'
    parameters.response_mode = 'form_post'
  }
  if (provider !== 'github' && transaction.nonce) {
    parameters.nonce = transaction.nonce
  }
  return oidc.buildAuthorizationUrl(configuration, parameters)
}

/**
 * openid-client checks state, PKCE, and, for OIDC, the ID token signature,
 * issuer, audience, expiry, and nonce against the provider JWKS.
 * The access token is used only to read a GitHub user id and is then dropped.
 */
export async function completeSocialAuthorization(
  config: ServiceConfig,
  transaction: OauthTransactionRow,
  request: Request,
): Promise<VerifiedSocialIdentity> {
  const provider = transaction.provider
  if (provider !== 'google' && provider !== 'apple' && provider !== 'github') {
    throw new Error('provider-disabled')
  }
  const configuration = await configurationFor(config, provider)
  const checks: oidc.AuthorizationCodeGrantChecks = {
    expectedState: transaction.state,
    pkceCodeVerifier: transaction.code_verifier,
  }
  if (provider !== 'github' && transaction.nonce) {
    checks.expectedNonce = transaction.nonce
    checks.idTokenExpected = true
  }
  const tokens = await oidc.authorizationCodeGrant(
    configuration,
    request,
    checks,
  )
  if (provider === 'github') {
    if (!tokens.access_token) throw new Error('token-invalid')
    return githubIdentity(config, tokens.access_token)
  }
  const claims = tokens.claims()
  if (!claims?.sub) throw new Error('token-invalid')
  return {
    provider,
    subject: claims.sub,
    email: verifiedEmail(claims as {email?: unknown; email_verified?: unknown}),
  }
}

function verifiedEmail(claims: {
  email?: unknown
  email_verified?: unknown
}): string | null {
  if (typeof claims.email !== 'string') return null
  const verified =
    claims.email_verified === true || claims.email_verified === 'true'
  if (!verified) return null
  return normalizeEmail(claims.email) ?? null
}

async function githubIdentity(
  config: ServiceConfig,
  accessToken: string,
): Promise<VerifiedSocialIdentity> {
  const github = config.github
  if (!github) throw new Error('provider-disabled')
  const response = await config.fetch(github.userEndpoint, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'aqua-identity',
    },
  })
  if (!response.ok) throw new Error('token-invalid')
  const body = (await response.json()) as {
    id?: number | string
    email?: string | null
  }
  if (
    body.id === undefined ||
    body.id === null ||
    String(body.id).trim() === ''
  ) {
    throw new Error('token-invalid')
  }
  const email =
    typeof body.email === 'string' ? (normalizeEmail(body.email) ?? null) : null
  return {provider: 'github', subject: String(body.id), email}
}
