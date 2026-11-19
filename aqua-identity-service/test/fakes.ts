import {
  createHash,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
} from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function signJwt(
  key: KeyObject,
  kid: string,
  payload: Record<string, unknown>,
) {
  const header = Buffer.from(
    JSON.stringify({alg: 'ES256', typ: 'JWT', kid}),
  ).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const data = `${header}.${body}`
  const signature = sign('sha256', Buffer.from(data), {
    key,
    dsaEncoding: 'ieee-p1363',
  })
  return `${data}.${signature.toString('base64url')}`
}

export async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
) {
  const server = createServer(handler)
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()))
      }),
  }
}

export type FakeOidc = {
  issuer: string
  close: () => Promise<void>
  tokenMode: 'ok' | 'bad-sig' | 'bad-aud' | 'expired'
  setSubject: (clientId: string, subject: string) => void
  setEmail: (subject: string, email: string) => void
}

export async function startFakeOidc(): Promise<FakeOidc> {
  const {privateKey, publicKey} = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  })
  const other = generateKeyPairSync('ec', {namedCurve: 'P-256'})
  const kid = 'aqua-test'
  const jwk = publicKey.export({format: 'jwk'}) as Record<string, string>
  jwk.kid = kid
  jwk.alg = 'ES256'
  jwk.use = 'sig'
  const subjects = new Map<string, string>()
  const emails = new Map<string, string>()
  const codes = new Map<
    string,
    {
      challenge: string | null
      nonce: string | null
      clientId: string
      sub: string
    }
  >()
  const fake: FakeOidc = {
    issuer: '',
    tokenMode: 'ok',
    setSubject: (clientId, subject) => subjects.set(clientId, subject),
    setEmail: (subject, email) => emails.set(subject, email),
    close: async () => {},
  }
  const server = await listen(async (req, res) => {
    const url = new URL(req.url ?? '/', fake.issuer || 'http://127.0.0.1')
    if (url.pathname === '/.well-known/openid-configuration') {
      sendJson(res, 200, {
        issuer: fake.issuer,
        authorization_endpoint: `${fake.issuer}/authorize`,
        token_endpoint: `${fake.issuer}/token`,
        jwks_uri: `${fake.issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
        code_challenge_methods_supported: ['S256'],
      })
      return
    }
    if (url.pathname === '/jwks') {
      sendJson(res, 200, {keys: [jwk]})
      return
    }
    if (url.pathname === '/authorize') {
      const code = randomBytes(16).toString('base64url')
      const clientId = url.searchParams.get('client_id') ?? ''
      codes.set(code, {
        challenge: url.searchParams.get('code_challenge'),
        nonce: url.searchParams.get('nonce'),
        clientId,
        sub: subjects.get(clientId) ?? `sub-${clientId}`,
      })
      const next = new URL(url.searchParams.get('redirect_uri') ?? fake.issuer)
      next.searchParams.set('code', code)
      next.searchParams.set('state', url.searchParams.get('state') ?? '')
      res.writeHead(302, {location: next.toString()})
      res.end()
      return
    }
    if (req.method === 'POST' && url.pathname === '/token') {
      const params = new URLSearchParams(await readBody(req))
      const saved = codes.get(params.get('code') ?? '')
      codes.delete(params.get('code') ?? '')
      if (!saved) {
        sendJson(res, 400, {error: 'invalid_grant'})
        return
      }
      const verifier = params.get('code_verifier') ?? ''
      const challenge = createHash('sha256')
        .update(verifier)
        .digest('base64url')
      if (challenge !== saved.challenge) {
        sendJson(res, 400, {error: 'invalid_grant'})
        return
      }
      const now = Math.floor(Date.now() / 1000)
      const token = signJwt(
        fake.tokenMode === 'bad-sig' ? other.privateKey : privateKey,
        kid,
        {
          iss: fake.issuer,
          aud: fake.tokenMode === 'bad-aud' ? 'wrong-client' : saved.clientId,
          sub: saved.sub,
          email: emails.get(saved.sub) ?? `${saved.sub}@example.com`,
          email_verified: true,
          nonce: saved.nonce,
          iat: now,
          exp: fake.tokenMode === 'expired' ? now - 60 : now + 600,
        },
      )
      sendJson(res, 200, {
        access_token: 'google-access-should-not-persist',
        token_type: 'Bearer',
        expires_in: 600,
        id_token: token,
      })
      return
    }
    sendJson(res, 404, {error: 'not-found'})
  })
  fake.issuer = server.origin
  fake.close = server.close
  return fake
}

export type FakeGithub = {
  origin: string
  close: () => Promise<void>
  userId: number
  email: string | null
  authorizationEndpoint: string
  tokenEndpoint: string
  userEndpoint: string
}

export async function startFakeGithub(): Promise<FakeGithub> {
  const codes = new Map<string, {challenge: string | null; userId: number}>()
  const tokens = new Map<string, number>()
  const fake: FakeGithub = {
    origin: '',
    userId: 1000,
    email: null,
    authorizationEndpoint: '',
    tokenEndpoint: '',
    userEndpoint: '',
    close: async () => {},
  }
  const server = await listen(async (req, res) => {
    const url = new URL(req.url ?? '/', fake.origin || 'http://127.0.0.1')
    if (url.pathname === '/login/oauth/authorize') {
      const code = randomBytes(16).toString('base64url')
      codes.set(code, {
        challenge: url.searchParams.get('code_challenge'),
        userId: fake.userId,
      })
      const next = new URL(url.searchParams.get('redirect_uri') ?? fake.origin)
      next.searchParams.set('code', code)
      next.searchParams.set('state', url.searchParams.get('state') ?? '')
      res.writeHead(302, {location: next.toString()})
      res.end()
      return
    }
    if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
      const params = new URLSearchParams(await readBody(req))
      const saved = codes.get(params.get('code') ?? '')
      codes.delete(params.get('code') ?? '')
      if (!saved) {
        sendJson(res, 400, {error: 'invalid_grant'})
        return
      }
      const verifier = params.get('code_verifier') ?? ''
      const challenge = createHash('sha256')
        .update(verifier)
        .digest('base64url')
      if (challenge !== saved.challenge) {
        sendJson(res, 400, {error: 'invalid_grant'})
        return
      }
      const access = `github-access-should-not-persist-${saved.userId}`
      tokens.set(access, saved.userId)
      sendJson(res, 200, {
        access_token: access,
        token_type: 'bearer',
        scope: 'read:user',
      })
      return
    }
    if (url.pathname === '/user') {
      const header = req.headers.authorization ?? ''
      const token = header.replace(/^Bearer /i, '')
      const userId = tokens.get(token)
      if (!userId) {
        sendJson(res, 401, {message: 'bad token'})
        return
      }
      sendJson(res, 200, {id: userId, login: 'octocat', email: fake.email})
      return
    }
    sendJson(res, 404, {error: 'not-found'})
  })
  fake.origin = server.origin
  fake.authorizationEndpoint = `${server.origin}/login/oauth/authorize`
  fake.tokenEndpoint = `${server.origin}/login/oauth/access_token`
  fake.userEndpoint = `${server.origin}/user`
  fake.close = server.close
  return fake
}
