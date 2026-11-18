import {
  AQUA_OAUTH_SCOPE,
  OAUTH_CALLBACK_PATH,
  OAUTH_METADATA_PATH,
} from './config'
import {assertDpopBound} from './dpop'
import {type AquaIdentityConfig, type PublicClientMetadata} from './types'

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' ||
        url.hostname === 'localhost' ||
        url.hostname === '::1' ||
        url.hostname === '[::1]')
    )
  } catch {
    return false
  }
}

export function buildPublicClientMetadata(
  config: Pick<AquaIdentityConfig, 'origin'>,
): PublicClientMetadata | undefined {
  const origin = config.origin.replace(/\/$/, '')
  if (!origin || isLoopbackOrigin(origin)) return undefined
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:') return undefined
  const metadata: PublicClientMetadata = {
    client_id: `${origin}${OAUTH_METADATA_PATH}`,
    client_name: 'AQUA',
    client_uri: origin,
    redirect_uris: [`${origin}${OAUTH_CALLBACK_PATH}`],
    scope: AQUA_OAUTH_SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'web',
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
  }
  assertDpopBound(metadata)
  return metadata
}

/**
 * `undefined` means the loopback public client (127.0.0.1 only).
 * `'unconfigured'` means a public HTTPS client_id is required and missing.
 */
export function selectClientMetadata(
  config: AquaIdentityConfig,
  currentOrigin: string | undefined,
): PublicClientMetadata | undefined | 'unconfigured' {
  if (currentOrigin && isLoopbackOrigin(currentOrigin)) return undefined
  const metadata = buildPublicClientMetadata(config)
  if (!metadata) return 'unconfigured'
  return metadata
}
