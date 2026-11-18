import {type DatabaseSync} from 'node:sqlite'

import {type AtprotoClient, type ServiceConfig} from './config.ts'

/**
 * In-process store for the AT Protocol confidential client.
 * The library keeps object identity for its token records, so this is not
 * serialized. Browser sessions live in SQLite. Tokens do not go to the browser.
 */
export function createMemoryStore() {
  const values = new Map<string, unknown>()
  return {
    async set(key: string, value: unknown) {
      values.set(key, value)
    },
    async get(key: string) {
      return values.get(key)
    },
    async del(key: string) {
      values.delete(key)
    },
  }
}

export async function loadAtprotoClient(
  config: ServiceConfig,
  _db: DatabaseSync,
): Promise<AtprotoClient> {
  if (!config.privateKeys)
    throw new Error('AQUA_IDENTITY_PRIVATE_KEYS is required')
  const {NodeOAuthClient} = await import('@atproto/oauth-client-node')
  const {JoseKey} = await import('@atproto/jwk-jose')
  const keyset = await Promise.all(
    config.privateKeys
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, index) => JoseKey.fromImportable(line, `aqua-${index + 1}`)),
  )
  if (keyset.length === 0) throw new Error('No importable client keys')
  const client = new NodeOAuthClient({
    clientMetadata: {
      client_id: `${config.origin}/client-metadata.json`,
      client_name: 'AQUA',
      client_uri: config.origin,
      redirect_uris: [`${config.origin}/oauth/callback`],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'atproto transition:generic',
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true,
      jwks_uri: `${config.origin}/jwks.json`,
    },
    keyset,
    stateStore: createMemoryStore() as never,
    sessionStore: createMemoryStore() as never,
    handleResolver: config.handleResolver || 'https://bsky.social',
  })
  return client as unknown as AtprotoClient
}
