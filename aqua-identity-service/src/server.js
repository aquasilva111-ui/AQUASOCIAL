import {randomBytes} from 'node:crypto'
import {createServer} from 'node:http'

import {createIpLimiter, createMemoryStore, sessionCookie} from './memory.js'

/**
 * Confidential OAuth BFF. Importing this file does not listen.
 * main() exits unless AQUA_IDENTITY_ENABLE_SERVER=true.
 * Passwords are never accepted. 616 is not consulted.
 */
const SCOPE = 'atproto transition:generic'

function readEnv(name) {
  return (process.env[name] ?? '').trim()
}

function metadata(origin) {
  return {
    client_id: `${origin}/client-metadata.json`,
    client_name: 'AQUA',
    client_uri: origin,
    redirect_uris: [`${origin}/oauth/callback`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: SCOPE,
    application_type: 'web',
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true,
    jwks_uri: `${origin}/jwks.json`,
  }
}

async function loadClient(origin) {
  const raw = readEnv('AQUA_IDENTITY_PRIVATE_KEYS')
  if (!raw) throw new Error('AQUA_IDENTITY_PRIVATE_KEYS is required')
  const {NodeOAuthClient} = await import('@atproto/oauth-client-node')
  const {JoseKey} = await import('@atproto/jwk-jose')
  const keyset = await Promise.all(
    raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, index) => JoseKey.fromImportable(line, `aqua-${index + 1}`)),
  )
  if (keyset.length === 0) throw new Error('No importable client keys')
  return new NodeOAuthClient({
    clientMetadata: metadata(origin),
    keyset,
    stateStore: createMemoryStore(),
    sessionStore: createMemoryStore(),
    handleResolver:
      readEnv('AQUA_IDENTITY_HANDLE_RESOLVER') || 'https://bsky.social',
  })
}

function cookieId(req) {
  const header = req.headers.cookie ?? ''
  const match = header.match(/(?:^|;\s*)aqua_session=([^;]+)/)
  return match?.[1]
}

export async function main() {
  if (readEnv('AQUA_IDENTITY_ENABLE_SERVER') !== 'true') {
    console.error(
      'Refusing to start. Set AQUA_IDENTITY_ENABLE_SERVER=true only on the separate BFF.',
    )
    process.exitCode = 1
    return
  }
  const origin = readEnv('AQUA_IDENTITY_ORIGIN').replace(/\/$/, '')
  if (!origin.startsWith('https://')) {
    console.error('AQUA_IDENTITY_ORIGIN must be https')
    process.exitCode = 1
    return
  }
  const client = await loadClient(origin)
  const allow = createIpLimiter()
  const browserSessions = new Map()
  const port = Number(readEnv('AQUA_IDENTITY_PORT') || '8787')

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', origin)
      if (req.method === 'GET' && url.pathname === '/client-metadata.json') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(client.clientMetadata))
        return
      }
      if (req.method === 'GET' && url.pathname === '/jwks.json') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(client.jwks))
        return
      }
      if (req.method === 'GET' && url.pathname === '/login') {
        const ip = req.socket.remoteAddress ?? 'unknown'
        if (!allow(ip)) {
          res.statusCode = 429
          res.end('rate-limited')
          return
        }
        const handle = url.searchParams.get('handle') ?? ''
        if (!handle) {
          res.statusCode = 400
          res.end('handle-or-did-required')
          return
        }
        const state = randomBytes(16).toString('base64url')
        const redirect = await client.authorize(handle, {state})
        res.statusCode = 302
        res.setHeader('location', redirect.toString())
        res.end()
        return
      }
      if (req.method === 'GET' && url.pathname === '/oauth/callback') {
        const {session, state} = await client.callback(url.searchParams)
        if (!state) {
          res.statusCode = 400
          res.end('state-missing')
          return
        }
        const sid = randomBytes(24).toString('base64url')
        browserSessions.set(sid, session.did)
        res.setHeader('set-cookie', sessionCookie(sid, true))
        res.statusCode = 302
        res.setHeader('location', `${origin}/onboarding`)
        res.end()
        return
      }
      if (req.method === 'POST' && url.pathname === '/logout') {
        const sid = cookieId(req)
        const did = sid ? browserSessions.get(sid) : undefined
        if (sid) browserSessions.delete(sid)
        if (did) await client.revoke(did)
        res.setHeader(
          'set-cookie',
          'aqua_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
        )
        res.end('ok')
        return
      }
      res.statusCode = 404
      res.end('not-found')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error'
      res.statusCode = 400
      res.end(message.replace(/password[=:][^\s]+/gi, 'password=[redacted]'))
    }
  })

  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  console.log(`AQUA Identity BFF listening on 127.0.0.1:${port}`)
}

const entry = process.argv[1] ?? ''
if (entry.endsWith('server.js') || entry.endsWith('server.ts')) {
  void main()
}
