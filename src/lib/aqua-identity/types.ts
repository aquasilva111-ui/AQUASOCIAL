/**
 * Account association is the DID. The handle is a display name that can change.
 * Passwords, app passwords, and OAuth tokens are not part of this record.
 */
export type AquaIdentityMethod = 'oauth' | 'pds-session'

export type AquaIdentityAccount = {
  did: string
  handle: string
  pdsUrl: string
  method: AquaIdentityMethod
  email?: string
  emailConfirmed?: boolean
}

export type ResolvedIdentity = {
  did: string
  handle?: string
  pdsUrl: string
}

export type Failure = {
  ok: false
  reason: string
  message?: string
}

export type PublicClientMetadata = {
  client_id: string
  client_name: string
  client_uri: string
  redirect_uris: string[]
  scope: string
  grant_types: ['authorization_code', 'refresh_token']
  response_types: ['code']
  application_type: 'web'
  token_endpoint_auth_method: 'none'
  dpop_bound_access_tokens: true
}

export type PendingOAuth = {
  state: string
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  createdAt: number
  expiresAt: number
  identifier: string
  expectedDid: string
  handle: string
  pdsUrl: string
}

export type OAuthCallbackParams = {
  code?: string
  state?: string
  error?: string
  errorDescription?: string
  iss?: string
}

export type LimitWindow = {
  limit: number
  windowMs: number
}

export type AquaIdentityConfig = {
  origin: string
  serviceUrl: string
  handleDomain: string
  pdsUrl: string
  pdsSignupEnabled: boolean
  inviteRequired: boolean
  captchaEnabled: boolean
  captchaSiteKey: string
  handleResolver: string
  plcDirectoryUrl: string
  dohUrl: string
  stateTtlMs: number
  limits: {
    login: LimitWindow
    register: LimitWindow
    recovery: LimitWindow
  }
}
