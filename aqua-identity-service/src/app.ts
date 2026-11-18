import {createHmac, randomBytes, randomUUID} from 'node:crypto'
import {type IncomingMessage, type ServerResponse} from 'node:http'
import {type DatabaseSync} from 'node:sqlite'

import {loadAtprotoClient} from './atproto.ts'
import {publicDirectory, type ServiceConfig} from './config.ts'
import {
  deleteSession,
  findSession,
  findUser,
  insertEmailCode,
  insertOauthTransaction,
  insertSession,
  listIdentities,
  openDatabase,
  takeEmailCode,
  takeOauthTransaction,
} from './db.ts'
import {normalizeHandle, verifyHandleDid} from './handles.ts'
import {
  appLocation,
  applyCors,
  assertBrowserPost,
  clearSessionCookie,
  clientIp,
  readBody,
  readCookie,
  redirect,
  RequestError,
  safeEqual,
  sendJson,
  sessionCookie,
  socialRedirectUri,
} from './http.ts'
import {createMailer, emailCodeMessage, type OutboundMail} from './mail.ts'
import {
  buildSocialAuthorization,
  completeSocialAuthorization,
  newCodeVerifier,
  newNonce,
} from './oauth-social.ts'
import {hashPassword, verifyPassword} from './passwords.ts'
import {createLimiter} from './rate-limit.ts'
import {
  AccountError,
  authorizationSubject,
  type ExternalProfile,
  linkProvider,
  loginWithProvider,
  normalizeEmail,
  recordDisplayHandle,
  setLocalPassword,
  unlinkProvider,
} from './users.ts'

export type IdentityApp = {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  db: DatabaseSync
  mailbox: OutboundMail[]
  close: () => void
}

const SOCIAL = new Set(['google', 'apple', 'github'])

function sessionHash(secret: string, id: string): string {
  return createHmac('sha256', secret).update(id).digest('base64url')
}

function codeDigest(secret: string, code: string): string {
  return createHmac('sha256', secret)
    .update(`email:${code}`)
    .digest('base64url')
}

function cookieOptions(config: ServiceConfig) {
  return {secure: config.secureCookies, sameSite: config.sameSite}
}

export async function createIdentityApp(
  config: ServiceConfig,
): Promise<IdentityApp> {
  if (config.sessionSecret.length < 32) {
    throw new Error('session secret must be at least 32 characters')
  }
  if (!config.allowInsecure && !config.origin.startsWith('https://')) {
    throw new Error('origin must be https unless the insecure test flag is on')
  }
  const db = openDatabase(config.databasePath)
  const mailbox: OutboundMail[] = []
  const mailer = await createMailer(config.email, mailbox)
  const atproto =
    config.atprotoClient ??
    (config.atprotoEnabled ? await loadAtprotoClient(config, db) : undefined)
  const dummyPassword = config.passwordLogin
    ? await hashPassword(`dummy:${config.sessionSecret}:not-a-login`)
    : ''
  const limitOauth = createLimiter(
    config.limits.oauthStart.limit,
    config.limits.oauthStart.windowMs,
  )
  const limitEmailIp = createLimiter(
    config.limits.emailStart.limit,
    config.limits.emailStart.windowMs,
  )
  const limitEmailAddress = createLimiter(
    config.limits.emailStart.limit,
    config.limits.emailStart.windowMs,
  )
  const limitEmailFinish = createLimiter(
    config.limits.emailFinish.limit,
    config.limits.emailFinish.windowMs,
  )
  const limitPassword = createLimiter(
    config.limits.password.limit,
    config.limits.password.windowMs,
  )

  function currentSession(req: IncomingMessage, now: number) {
    const id = readCookie(req.headers.cookie, 'aqua_session')
    if (!id) return undefined
    const row = findSession(db, sessionHash(config.sessionSecret, id))
    if (!row) return undefined
    if (row.expires_at <= now) {
      deleteSession(db, row.id_hash)
      return undefined
    }
    return row
  }

  function requireSession(req: IncomingMessage, now: number) {
    const session = currentSession(req, now)
    if (!session) throw new RequestError(401, 'session-required')
    return session
  }

  function assertCsrf(req: IncomingMessage, csrf: string) {
    const header = req.headers['x-aqua-csrf']
    const value = Array.isArray(header) ? header[0] : header
    if (typeof value !== 'string' || !safeEqual(value, csrf)) {
      throw new RequestError(403, 'csrf-invalid')
    }
  }

  function assertFresh(authAt: number, now: number) {
    if (now - authAt > config.reauthWindowMs) {
      throw new RequestError(403, 'reauth-required')
    }
  }

  function issueBrowserSession(userId: string, now: number) {
    const id = randomBytes(32).toString('base64url')
    const csrf = randomBytes(32).toString('base64url')
    insertSession(db, {
      idHash: sessionHash(config.sessionSecret, id),
      userId,
      csrfSecret: csrf,
      now,
      expiresAt: now + config.sessionTtlSeconds * 1000,
    })
    return {
      id,
      csrf,
      cookie: sessionCookie(id, {
        ...cookieOptions(config),
        maxAge: config.sessionTtlSeconds,
      }),
    }
  }

  function rotate(req: IncomingMessage, userId: string, now: number) {
    const previous = readCookie(req.headers.cookie, 'aqua_session')
    if (previous) deleteSession(db, sessionHash(config.sessionSecret, previous))
    return issueBrowserSession(userId, now)
  }

  function failRedirect(res: ServerResponse, intent: string, reason: string) {
    const path = intent === 'link' ? '/settings/identity' : '/login'
    redirect(res, appLocation(config, path, {social_error: reason}))
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      if (applyCors(req, res, config.appOrigins)) return
      const url = new URL(req.url ?? '/', config.origin)
      const now = config.now()
      const method = req.method ?? 'GET'

      if (method === 'GET' && url.pathname === '/providers') {
        sendJson(res, 200, publicDirectory(config))
        return
      }
      if (method === 'GET' && url.pathname === '/session') {
        sendJson(res, 200, sessionBody(req, now))
        return
      }
      if (method === 'POST' && url.pathname === '/logout') {
        await logout(req, res, now)
        return
      }
      if (method === 'GET' && url.pathname === '/oauth/social/start') {
        await startSocial(req, res, url, now)
        return
      }
      if (
        (method === 'GET' || method === 'POST') &&
        url.pathname === '/oauth/social/callback'
      ) {
        await finishSocial(req, res, url, now)
        return
      }
      if (method === 'POST' && url.pathname === '/login/email/start') {
        await startEmail(req, res, now)
        return
      }
      if (method === 'POST' && url.pathname === '/login/email/finish') {
        await finishEmail(req, res, now)
        return
      }
      if (method === 'POST' && url.pathname === '/login/password') {
        await loginPassword(req, res, now)
        return
      }
      if (method === 'POST' && url.pathname === '/password') {
        await assignPassword(req, res, now)
        return
      }
      if (method === 'POST' && url.pathname === '/identities/unlink') {
        await unlink(req, res, now)
        return
      }
      if (method === 'POST' && url.pathname === '/handle') {
        await claimHandle(req, res, now)
        return
      }
      if (
        atproto &&
        method === 'GET' &&
        url.pathname === '/client-metadata.json'
      ) {
        sendJson(res, 200, atproto.clientMetadata)
        return
      }
      if (atproto && method === 'GET' && url.pathname === '/jwks.json') {
        sendJson(res, 200, atproto.jwks)
        return
      }
      if (atproto && method === 'GET' && url.pathname === '/login') {
        await startAtproto(req, res, url, now)
        return
      }
      if (atproto && method === 'GET' && url.pathname === '/oauth/callback') {
        await finishAtproto(req, res, url, now)
        return
      }
      sendJson(res, 404, {error: 'not-found'})
    } catch (error) {
      if (res.headersSent) return
      if (error instanceof RequestError) {
        sendJson(res, error.status, {error: error.reason})
        return
      }
      if (error instanceof AccountError) {
        sendJson(res, statusForAccount(error.reason), {error: error.reason})
        return
      }
      console.error(
        'identity request failed',
        error instanceof Error ? error.name : 'error',
      )
      sendJson(res, 400, {error: 'bad-request'})
    }
  }

  function sessionBody(req: IncomingMessage, now: number) {
    const session = currentSession(req, now)
    if (!session) return {authenticated: false, authorization: null}
    const user = findUser(db, session.user_id)
    if (!user) return {authenticated: false, authorization: null}
    return {
      authenticated: true,
      csrfToken: session.csrf_secret,
      reauthFresh: now - session.auth_at <= config.reauthWindowMs,
      authorization: authorizationSubject(user),
      user: {id: user.id, did: user.did, handle: user.handle},
      identities: listIdentities(db, user.id).map(item => ({
        provider: item.provider,
      })),
    }
  }

  async function logout(
    req: IncomingMessage,
    res: ServerResponse,
    now: number,
  ) {
    assertBrowserPost(req, config)
    const session = currentSession(req, now)
    if (session) {
      assertCsrf(req, session.csrf_secret)
      deleteSession(db, session.id_hash)
      const user = findUser(db, session.user_id)
      if (user?.did && atproto) {
        try {
          await atproto.revoke(user.did)
        } catch {
          console.error('atproto revoke failed')
        }
      }
    }
    sendJson(
      res,
      200,
      {ok: true},
      {
        'set-cookie': clearSessionCookie(cookieOptions(config)),
      },
    )
  }

  async function startSocial(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    now: number,
  ) {
    const provider = url.searchParams.get('provider') ?? ''
    if (
      !SOCIAL.has(provider) ||
      !config[provider as 'google' | 'apple' | 'github']
    ) {
      throw new RequestError(404, 'provider-disabled')
    }
    const intent = url.searchParams.get('intent') === 'link' ? 'link' : 'login'
    const ip = clientIp(req, config.trustProxy)
    if (!limitOauth(ip, now)) throw new RequestError(429, 'rate-limited')
    let userId: string | null = null
    if (intent === 'link') {
      const session = requireSession(req, now)
      const csrf = url.searchParams.get('csrf') ?? ''
      if (!safeEqual(csrf, session.csrf_secret)) {
        throw new RequestError(403, 'csrf-invalid')
      }
      assertFresh(session.auth_at, now)
      userId = session.user_id
    }
    const state = randomBytes(32).toString('base64url')
    const socialProvider = provider as 'google' | 'apple' | 'github'
    const nonce = socialProvider === 'github' ? null : newNonce()
    const redirectUri = socialRedirectUri(config.origin)
    insertOauthTransaction(db, {
      state,
      provider: socialProvider,
      codeVerifier: newCodeVerifier(),
      nonce,
      redirectUri,
      intent,
      userId,
      now,
      expiresAt: now + config.stateTtlMs,
    })
    const location = await buildSocialAuthorization(config, socialProvider, {
      state,
      codeVerifier:
        // The verifier just stored is the one the callback will send.
        // Read it back so the authorization URL cannot drift from the row.
        takeVerifier(state),
      nonce,
      redirectUri,
    })
    const sent = new URL(location)
    if (sent.searchParams.get('redirect_uri') !== redirectUri) {
      throw new RequestError(500, 'bad-request')
    }
    redirect(res, sent.toString())
  }

  function takeVerifier(state: string): string {
    const row = db
      .prepare('SELECT code_verifier FROM oauth_transactions WHERE state = ?')
      .get(state) as {code_verifier?: string} | undefined
    if (!row?.code_verifier) throw new RequestError(400, 'state-mismatch')
    return row.code_verifier
  }

  async function finishSocial(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    now: number,
  ) {
    const body = req.method === 'POST' ? await readBody(req) : ''
    const params =
      req.method === 'POST' ? new URLSearchParams(body) : url.searchParams
    const state = params.get('state') ?? ''
    if (!state) {
      failRedirect(res, 'login', 'state-mismatch')
      return
    }
    const taken = takeOauthTransaction(db, state, now)
    if (!taken.ok) {
      failRedirect(res, 'login', taken.reason)
      return
    }
    if (params.get('error')) {
      failRedirect(res, taken.row.intent, 'oauth-error')
      return
    }
    const request =
      req.method === 'POST'
        ? new Request(url, {
            method: 'POST',
            headers: {'content-type': 'application/x-www-form-urlencoded'},
            body,
          })
        : new Request(url)
    try {
      const identity = await completeSocialAuthorization(
        config,
        taken.row,
        request,
      )
      const profile: ExternalProfile = {
        provider: identity.provider,
        subject: identity.subject,
        email: identity.email,
      }
      if (taken.row.intent === 'link') {
        if (!taken.row.user_id) throw new AccountError('session-required')
        linkProvider(db, taken.row.user_id, profile, now)
        redirect(
          res,
          appLocation(config, '/settings/identity', {
            social_linked: identity.provider,
          }),
        )
        return
      }
      const login = loginWithProvider(db, profile, now)
      const session = rotate(req, login.userId, now)
      redirect(res, appLocation(config, '/onboarding'), [session.cookie])
    } catch (error) {
      const reason =
        error instanceof AccountError ? error.reason : 'token-invalid'
      failRedirect(res, taken.row.intent, reason)
    }
  }

  async function startEmail(
    req: IncomingMessage,
    res: ServerResponse,
    now: number,
  ) {
    assertBrowserPost(req, config)
    if (!config.email) throw new RequestError(404, 'provider-disabled')
    const payload = await jsonObject(req)
    const email = normalizeEmail(stringField(payload, 'email') ?? '')
    if (!email) throw new RequestError(400, 'invalid-email')
    const intent = stringField(payload, 'intent') === 'link' ? 'link' : 'login'
    let userId: string | null = null
    if (intent === 'link') {
      const session = requireSession(req, now)
      assertCsrf(req, session.csrf_secret)
      assertFresh(session.auth_at, now)
      userId = session.user_id
    }
    const ip = clientIp(req, config.trustProxy)
    if (!limitEmailIp(ip, now) || !limitEmailAddress(email, now)) {
      throw new RequestError(429, 'rate-limited')
    }
    const code = randomBytes(9).toString('base64url')
    insertEmailCode(db, {
      id: randomUUID(),
      email,
      codeHash: codeDigest(config.sessionSecret, code),
      intent,
      userId,
      now,
      expiresAt: now + config.emailCodeTtlMs,
    })
    const message = emailCodeMessage(code)
    message.to = email
    try {
      await mailer.send(message)
    } catch {
      throw new RequestError(503, 'email-unavailable')
    }
    sendJson(res, 200, {ok: true})
  }

  async function finishEmail(
    req: IncomingMessage,
    res: ServerResponse,
    now: number,
  ) {
    assertBrowserPost(req, config)
    if (!config.email) throw new RequestError(404, 'provider-disabled')
    const payload = await jsonObject(req)
    const email = normalizeEmail(stringField(payload, 'email') ?? '')
    const code = (stringField(payload, 'code') ?? '').trim()
    if (!email || !code) throw new RequestError(400, 'code-invalid')
    const ip = clientIp(req, config.trustProxy)
    if (!limitEmailFinish(`${ip}:${email}`, now)) {
      throw new RequestError(429, 'rate-limited')
    }
    const row = takeEmailCode(
      db,
      email,
      codeDigest(config.sessionSecret, code),
      now,
    )
    if (!row) throw new RequestError(400, 'code-invalid')
    if (row.intent === 'link') {
      if (!row.user_id) throw new RequestError(400, 'code-invalid')
      const session = requireSession(req, now)
      if (session.user_id !== row.user_id) {
        throw new RequestError(400, 'code-invalid')
      }
      assertCsrf(req, session.csrf_secret)
      linkProvider(
        db,
        row.user_id,
        {provider: 'email', subject: email, email},
        now,
      )
      sendJson(res, 200, {ok: true})
      return
    }
    const login = loginWithProvider(
      db,
      {provider: 'email', subject: email, email},
      now,
    )
    const session = rotate(req, login.userId, now)
    const user = findUser(db, login.userId)
    sendJson(
      res,
      200,
      {
        ok: true,
        authorization: user ? authorizationSubject(user) : null,
      },
      {'set-cookie': session.cookie},
    )
  }

  async function loginPassword(
    req: IncomingMessage,
    res: ServerResponse,
    now: number,
  ) {
    assertBrowserPost(req, config)
    if (!config.passwordLogin) throw new RequestError(404, 'provider-disabled')
    const payload = await jsonObject(req)
    const email = normalizeEmail(stringField(payload, 'email') ?? '')
    const password = stringField(payload, 'password') ?? ''
    const ip = clientIp(req, config.trustProxy)
    if (!limitPassword(ip, now)) throw new RequestError(429, 'rate-limited')
    if (!email || !password) throw new RequestError(401, 'login-failed')
    const identity = email
      ? (db
          .prepare(
            `SELECT user_id FROM identities WHERE provider = 'email' AND subject = ?`,
          )
          .get(email) as {user_id?: string} | undefined)
      : undefined
    const user = identity?.user_id ? findUser(db, identity.user_id) : undefined
    const hash = user?.password_hash || dummyPassword
    const matches = hash ? await verifyPassword(password, hash) : false
    if (!user?.password_hash || !matches) {
      throw new RequestError(401, 'login-failed')
    }
    const session = rotate(req, user.id, now)
    sendJson(
      res,
      200,
      {ok: true, authorization: authorizationSubject(user)},
      {'set-cookie': session.cookie},
    )
  }

  async function assignPassword(
    req: IncomingMessage,
    res: ServerResponse,
    now: number,
  ) {
    assertBrowserPost(req, config)
    if (!config.passwordLogin) throw new RequestError(404, 'provider-disabled')
    const session = requireSession(req, now)
    assertCsrf(req, session.csrf_secret)
    assertFresh(session.auth_at, now)
    const payload = await jsonObject(req)
    await setLocalPassword(
      db,
      session.user_id,
      stringField(payload, 'password') ?? '',
      now,
    )
    sendJson(res, 200, {ok: true})
  }

  async function unlink(
    req: IncomingMessage,
    res: ServerResponse,
    now: number,
  ) {
    assertBrowserPost(req, config)
    const session = requireSession(req, now)
    assertCsrf(req, session.csrf_secret)
    assertFresh(session.auth_at, now)
    const payload = await jsonObject(req)
    unlinkProvider(
      db,
      session.user_id,
      stringField(payload, 'provider') ?? '',
      now,
    )
    sendJson(res, 200, {ok: true})
  }

  async function claimHandle(
    req: IncomingMessage,
    res: ServerResponse,
    now: number,
  ) {
    assertBrowserPost(req, config)
    const session = requireSession(req, now)
    assertCsrf(req, session.csrf_secret)
    assertFresh(session.auth_at, now)
    const payload = await jsonObject(req)
    const handle = normalizeHandle(stringField(payload, 'handle') ?? '')
    if (!handle) throw new RequestError(400, 'invalid-handle')
    const user = findUser(db, session.user_id)
    if (!user?.did) throw new AccountError('missing-did')
    const verified = await verifyHandleDid({
      handle,
      expectedDid: user.did,
      fetch: config.fetch,
      dohUrl: config.dohUrl,
    })
    if (!verified.ok) throw new RequestError(400, verified.reason)
    const recorded = recordDisplayHandle(db, user.id, handle, now)
    sendJson(res, 200, {ok: true, ...recorded})
  }

  async function startAtproto(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    now: number,
  ) {
    if (!atproto) throw new RequestError(404, 'provider-disabled')
    const ip = clientIp(req, config.trustProxy)
    if (!limitOauth(ip, now)) throw new RequestError(429, 'rate-limited')
    const handle = url.searchParams.get('handle') ?? ''
    if (!handle.trim()) throw new RequestError(400, 'handle-or-did-required')
    const state = randomBytes(16).toString('base64url')
    const location = await atproto.authorize(handle, {state})
    const target =
      location instanceof URL ? location : new URL(String(location))
    redirect(res, target.toString())
  }

  async function finishAtproto(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    now: number,
  ) {
    if (!atproto) throw new RequestError(404, 'provider-disabled')
    try {
      const result = await atproto.callback(url.searchParams)
      if (!result.state) throw new RequestError(400, 'state-missing')
      const login = loginWithProvider(
        db,
        {provider: 'atproto', subject: result.session.did, email: null},
        now,
      )
      const session = rotate(req, login.userId, now)
      redirect(res, appLocation(config, '/onboarding'), [session.cookie])
    } catch (error) {
      if (error instanceof RequestError || error instanceof AccountError)
        throw error
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      throw new RequestError(
        400,
        message.includes('state') ? 'state-mismatch' : 'oauth-error',
      )
    }
  }

  return {
    handle,
    db,
    mailbox,
    close() {
      db.close()
    },
  }
}

function statusForAccount(reason: string): number {
  if (reason === 'session-required') return 401
  if (reason === 'account-conflict' || reason === 'last-method') return 409
  if (reason === 'reauth-required' || reason === 'password-depends-on-email') {
    return 403
  }
  if (reason === 'missing-did' || reason === 'email-required') return 409
  return 400
}

async function jsonObject(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const raw = await readBody(req)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new RequestError(400, 'bad-request')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestError(400, 'bad-request')
  }
  return parsed as Record<string, unknown>
}

function stringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}
