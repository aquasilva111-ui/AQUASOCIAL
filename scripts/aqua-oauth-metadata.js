function buildPublicClientMetadata(origin) {
  const base = String(origin || '').replace(/\/$/, '')
  if (!base) return null
  let url
  try {
    url = new URL(base)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  return {
    client_id: `${base}/oauth/client-metadata.json`,
    client_name: 'AQUA',
    client_uri: base,
    redirect_uris: [`${base}/oauth/callback`],
    scope: 'atproto transition:generic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'web',
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
  }
}

module.exports = {buildPublicClientMetadata}
