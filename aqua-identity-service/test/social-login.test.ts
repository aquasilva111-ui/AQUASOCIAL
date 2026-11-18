import assert from 'node:assert/strict'
import {generateKeyPairSync} from 'node:crypto'
import {after, before, describe, it} from 'node:test'

import {createIdentityApp, type IdentityApp} from '../src/app.ts'
import {SERVICE_616_BOUNDARY} from '../src/boundary.ts'
import {
  publicDirectory,
  readServiceConfig,
  type ServiceConfig,
} from '../src/config.ts'
import {main} from '../src/server.ts'
import {
  type FakeGithub,
  type FakeOidc,
  listen,
  startFakeGithub,
  startFakeOidc,
} from './fakes.ts'

const APP = 'http://127.0.0.1:5999'
const SECRET = 'test-session-secret-must-be-32-characters'

type Clock = {now: number}

function configFor(
  clock: Clock,
  input: Partial<ServiceConfig> = {},
): ServiceConfig {
  return {
    origin: 'http://127.0.0.1:9',
    appOrigins: [APP],
    databasePath: ':memory:',
    sessionSecret: SECRET,
    secureCookies: true,
    sameSite: 'Lax',
    allowInsecure: true,
    reauthWindowMs: 10 * 60 * 1000,
    sessionTtlSeconds: 604800,
    stateTtlMs: 10 * 60 * 1000,
    emailCodeTtlMs: 15 * 60 * 1000,
    port: 0,
    host: '127.0.0.1',
    dohUrl: 'https://doh.example/dns-query',
    handleResolver: 'https://bsky.example',
    privateKeys: '',
    passwordLogin: false,
    trustProxy: false,
    atprotoEnabled: false,
    fetch: globalThis.fetch.bind(globalThis),
    limits: {
      oauthStart: {limit: 50, windowMs: 15 * 60 * 1000},
      emailStart: {limit: 30, windowMs: 60 * 60 * 1000},
      emailFinish: {limit: 8, windowMs: 15 * 60 * 1000},
      password: {limit: 5, windowMs: 15 * 60 * 1000},
    },
    ...input,
    now: () => clock.now,
  }
}

async function boot(config: ServiceConfig) {
  let current: IdentityApp | undefined
  const server = await listen((req, res) => {
    if (!current) {
      res.statusCode = 503
      res.end()
      return
    }
    void current.handle(req, res)
  })
  current = await createIdentityApp({...config, origin: server.origin})
  return {
    origin: server.origin,
    app: current,
    close: async () => {
      current?.close()
      await server.close()
    },
  }
}

function browserHeaders(extra: Record<string, string> = {}) {
  return {
    origin: APP,
    'x-aqua-client': 'aqua-identity',
    ...extra,
  }
}

function cookiePair(response: Response) {
  const raw = response.headers
    .getSetCookie()
    .find(item => item.startsWith('aqua_session='))
  assert.ok(raw)
  assert.match(raw, /HttpOnly/)
  assert.match(raw, /SameSite=Lax/)
  assert.match(raw, /Secure/)
  assert.doesNotMatch(raw, /password|access_token|client_secret|refresh/i)
  return raw.split(';')[0] ?? ''
}

function countUsers(app: IdentityApp) {
  const row = app.db.prepare('SELECT count(*) AS n FROM users').get() as {
    n: number
  }
  return row.n
}

function dump(app: IdentityApp) {
  const tables = [
    'users',
    'identities',
    'sessions',
    'oauth_transactions',
    'email_codes',
    'kv',
  ]
  return JSON.stringify(
    Object.fromEntries(
      tables.map(table => [
        table,
        app.db.prepare(`SELECT * FROM ${table}`).all(),
      ]),
    ),
  )
}

async function loginProvider(
  service: string,
  provider: 'google' | 'apple' | 'github',
  query = '',
) {
  const start = await fetch(
    `${service}/oauth/social/start?provider=${provider}${query}`,
    {redirect: 'manual'},
  )
  assert.equal(start.status, 302)
  const authorize = new URL(start.headers.get('location') ?? '')
  assert.equal(authorize.searchParams.get('client_secret'), null)
  assert.equal(
    authorize.searchParams.get('redirect_uri'),
    `${service}/oauth/social/callback`,
  )
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(authorize.searchParams.get('code_challenge'))
  assert.ok(authorize.searchParams.get('state'))
  if (provider !== 'github') assert.ok(authorize.searchParams.get('nonce'))
  const authorized = await fetch(authorize, {redirect: 'manual'})
  assert.equal(authorized.status, 302)
  const callback = authorized.headers.get('location') ?? ''
  if (provider === 'apple') {
    const params = new URL(callback).searchParams
    return fetch(`${service}/oauth/social/callback`, {
      method: 'POST',
      redirect: 'manual',
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        code: params.get('code') ?? '',
        state: params.get('state') ?? '',
      }),
    })
  }
  return fetch(callback, {redirect: 'manual'})
}

describe('social login service', () => {
  const clock: Clock = {now: Date.parse('2026-11-18T12:00:00Z')}
  let oidc: FakeOidc
  let github: FakeGithub
  let service: Awaited<ReturnType<typeof boot>>

  before(async () => {
    oidc = await startFakeOidc()
    github = await startFakeGithub()
    const draft = configFor(clock, {origin: 'http://127.0.0.1:9'})
    service = await boot({
      ...draft,
      google: {
        clientId: 'google-client',
        clientSecret: 'google-client-secret',
        issuer: oidc.issuer,
      },
      apple: {
        clientId: 'apple-client',
        teamId: 'TEAMID123',
        keyId: 'KEYID123',
        privateKeyPem: appleKey(),
        issuer: oidc.issuer,
      },
      github: {
        clientId: 'github-client',
        clientSecret: 'github-client-secret',
        authorizationEndpoint: github.authorizationEndpoint,
        tokenEndpoint: github.tokenEndpoint,
        userEndpoint: github.userEndpoint,
      },
      email: {from: 'AQUA <login@aqua.example>', transport: 'capture'},
    })
  })

  after(async () => {
    await service.close()
    await oidc.close()
    await github.close()
  })

  it('lists only configured providers and hides secrets', async () => {
    const response = await fetch(`${service.origin}/providers`, {
      headers: {origin: APP},
    })
    const body = (await response.json()) as {providers: string[]}
    assert.deepEqual(body.providers, ['google', 'apple', 'github', 'email'])
    assert.equal(JSON.stringify(body).includes('google-client-secret'), false)
    assert.equal(JSON.stringify(body).includes('github-client-secret'), false)
    const evil = await fetch(`${service.origin}/providers`, {
      headers: {origin: 'https://evil.example'},
    })
    assert.equal(evil.headers.get('access-control-allow-origin'), null)
    assert.equal(response.headers.get('access-control-allow-origin'), APP)
  })

  it('logs in with Google, then logs out', async () => {
    oidc.tokenMode = 'ok'
    oidc.setSubject('google-client', 'google-sub-login')
    const before = countUsers(service.app)
    const done = await loginProvider(
      service.origin,
      'google',
      '&redirect_uri=https://evil.example/steal',
    )
    assert.equal(done.status, 302)
    assert.match(done.headers.get('location') ?? '', /\/onboarding$/)
    const cookie = cookiePair(done)
    assert.equal(countUsers(service.app), before + 1)
    const session = await fetch(`${service.origin}/session`, {
      headers: {cookie},
    })
    const body = (await session.json()) as {
      authenticated: boolean
      authorization: {userId: string; did: string | null}
      identities: {provider: string}[]
    }
    assert.equal(body.authenticated, true)
    assert.equal(body.authorization.did, null)
    assert.deepEqual(Object.keys(body.authorization).sort(), ['did', 'userId'])
    assert.deepEqual(body.identities, [{provider: 'google'}])
    assert.equal(
      dump(service.app).includes('google-access-should-not-persist'),
      false,
    )
    const repeat = await loginProvider(service.origin, 'google')
    assert.equal(repeat.status, 302)
    assert.equal(countUsers(service.app), before + 1)
    const repeatCookie = cookiePair(repeat)
    const repeatSession = (await (
      await fetch(`${service.origin}/session`, {
        headers: {cookie: repeatCookie},
      })
    ).json()) as {csrfToken: string; authorization: {userId: string}}
    assert.equal(repeatSession.authorization.userId, body.authorization.userId)
    const loggedOut = await fetch(`${service.origin}/logout`, {
      method: 'POST',
      headers: browserHeaders({
        cookie: repeatCookie,
        'content-type': 'application/json',
        'x-aqua-csrf': repeatSession.csrfToken,
      }),
      body: '{}',
    })
    assert.equal(loggedOut.status, 200)
    assert.match(loggedOut.headers.get('set-cookie') ?? '', /Max-Age=0/)
    const afterLogout = (await (
      await fetch(`${service.origin}/session`, {
        headers: {cookie: repeatCookie},
      })
    ).json()) as {authenticated: boolean}
    assert.equal(afterLogout.authenticated, false)
  })

  it('rejects an unknown state, a bad token, and a disabled provider', async () => {
    const before = countUsers(service.app)
    const state = await fetch(
      `${service.origin}/oauth/social/callback?state=not-a-real-state&code=x`,
      {redirect: 'manual'},
    )
    assert.equal(state.status, 302)
    assert.match(
      state.headers.get('location') ?? '',
      /social_error=state-mismatch/,
    )
    for (const mode of ['bad-sig', 'bad-aud', 'expired'] as const) {
      oidc.tokenMode = mode
      oidc.setSubject('google-client', `google-bad-${mode}`)
      const failed = await loginProvider(service.origin, 'google')
      assert.equal(failed.status, 302)
      assert.match(
        failed.headers.get('location') ?? '',
        /social_error=token-invalid/,
      )
    }
    oidc.tokenMode = 'ok'
    const disabled = await fetch(
      `${service.origin}/oauth/social/start?provider=password`,
    )
    assert.equal(disabled.status, 404)
    const body = (await disabled.json()) as {error: string}
    assert.equal(body.error, 'provider-disabled')
    assert.equal(countUsers(service.app), before)
  })

  it('signs in with Apple form_post and GitHub without storing provider tokens', async () => {
    oidc.tokenMode = 'ok'
    oidc.setSubject('apple-client', 'apple-sub-1')
    const apple = await loginProvider(service.origin, 'apple')
    assert.equal(apple.status, 302)
    assert.match(apple.headers.get('location') ?? '', /\/onboarding$/)
    cookiePair(apple)
    github.userId = 8801
    const gh = await loginProvider(service.origin, 'github')
    assert.equal(gh.status, 302)
    const stored = dump(service.app)
    assert.equal(stored.includes('github-access-should-not-persist'), false)
    assert.equal(stored.includes('google-client-secret'), false)
    assert.equal(stored.includes('github-client-secret'), false)
  })

  it('does not merge accounts that share an e-mail', async () => {
    oidc.tokenMode = 'ok'
    const subject = 'google-sub-email-shared'
    oidc.setSubject('google-client', subject)
    oidc.setEmail(subject, 'shared-person@example.com')
    const google = await loginProvider(service.origin, 'google')
    const googleCookie = cookiePair(google)
    const googleSession = (await (
      await fetch(`${service.origin}/session`, {
        headers: {cookie: googleCookie},
      })
    ).json()) as {authorization: {userId: string}}
    const started = await fetch(`${service.origin}/login/email/start`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({email: 'shared-person@example.com'}),
    })
    assert.equal(started.status, 200)
    const code = codeFrom(service.app.mailbox.at(-1)?.text ?? '')
    const finished = await fetch(`${service.origin}/login/email/finish`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({email: 'shared-person@example.com', code}),
    })
    assert.equal(finished.status, 200)
    const emailCookie = cookiePair(finished)
    const emailSession = (await (
      await fetch(`${service.origin}/session`, {headers: {cookie: emailCookie}})
    ).json()) as {
      authorization: {userId: string}
      identities: {provider: string}[]
    }
    assert.notEqual(
      emailSession.authorization.userId,
      googleSession.authorization.userId,
    )
    assert.deepEqual(emailSession.identities, [{provider: 'email'}])
    assert.equal(dump(service.app).includes(code), false)
  })

  it('links and unlinks only after a fresh login, and keeps the last method', async () => {
    oidc.tokenMode = 'ok'
    oidc.setSubject('google-client', 'google-sub-link')
    github.userId = 8802
    const google = await loginProvider(service.origin, 'google')
    const cookie = cookiePair(google)
    const first = (await (
      await fetch(`${service.origin}/session`, {headers: {cookie}})
    ).json()) as {csrfToken: string; authorization: {userId: string}}
    const linked = await linkGithub(service.origin, cookie, first.csrfToken)
    assert.equal(linked.status, 302)
    assert.match(linked.headers.get('location') ?? '', /social_linked=github/)
    const both = (await (
      await fetch(`${service.origin}/session`, {headers: {cookie}})
    ).json()) as {
      identities: {provider: string}[]
      authorization: {userId: string}
    }
    assert.deepEqual(
      both.identities.map(item => item.provider),
      ['google', 'github'],
    )
    assert.equal(both.authorization.userId, first.authorization.userId)
    clock.now += 11 * 60 * 1000
    const stale = await fetch(`${service.origin}/identities/unlink`, {
      method: 'POST',
      headers: browserHeaders({
        cookie,
        'content-type': 'application/json',
        'x-aqua-csrf': first.csrfToken,
      }),
      body: JSON.stringify({provider: 'github'}),
    })
    assert.equal(stale.status, 403)
    assert.equal(
      ((await stale.json()) as {error: string}).error,
      'reauth-required',
    )
    const fresh = await loginProvider(service.origin, 'google')
    const freshCookie = cookiePair(fresh)
    const freshSession = (await (
      await fetch(`${service.origin}/session`, {headers: {cookie: freshCookie}})
    ).json()) as {csrfToken: string; reauthFresh: boolean}
    assert.equal(freshSession.reauthFresh, true)
    const removed = await fetch(`${service.origin}/identities/unlink`, {
      method: 'POST',
      headers: browserHeaders({
        cookie: freshCookie,
        'content-type': 'application/json',
        'x-aqua-csrf': freshSession.csrfToken,
      }),
      body: JSON.stringify({provider: 'github'}),
    })
    assert.equal(removed.status, 200)
    const last = await fetch(`${service.origin}/identities/unlink`, {
      method: 'POST',
      headers: browserHeaders({
        cookie: freshCookie,
        'content-type': 'application/json',
        'x-aqua-csrf': freshSession.csrfToken,
      }),
      body: JSON.stringify({provider: 'google'}),
    })
    assert.equal(last.status, 409)
    assert.equal(((await last.json()) as {error: string}).error, 'last-method')
  })

  it('refuses to attach an identity that already belongs to someone else', async () => {
    github.userId = 8803
    const owner = await loginProvider(service.origin, 'github')
    const ownerCookie = cookiePair(owner)
    oidc.setSubject('google-client', 'google-sub-conflict')
    const other = await loginProvider(service.origin, 'google')
    const otherCookie = cookiePair(other)
    const otherSession = (await (
      await fetch(`${service.origin}/session`, {headers: {cookie: otherCookie}})
    ).json()) as {csrfToken: string; authorization: {userId: string}}
    const ownerSession = (await (
      await fetch(`${service.origin}/session`, {headers: {cookie: ownerCookie}})
    ).json()) as {authorization: {userId: string}}
    const conflict = await linkGithub(
      service.origin,
      otherCookie,
      otherSession.csrfToken,
    )
    assert.match(
      conflict.headers.get('location') ?? '',
      /social_error=account-conflict/,
    )
    const after = (await (
      await fetch(`${service.origin}/session`, {headers: {cookie: otherCookie}})
    ).json()) as {
      identities: {provider: string}[]
      authorization: {userId: string}
    }
    assert.deepEqual(after.identities, [{provider: 'google'}])
    assert.notEqual(
      after.authorization.userId,
      ownerSession.authorization.userId,
    )
  })

  it('recovers access with a single-use e-mail code and rate limits repeats', async () => {
    const email = 'recover-person@example.com'
    const first = await fetch(`${service.origin}/login/email/start`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({email}),
    })
    assert.equal(first.status, 200)
    const code = codeFrom(service.app.mailbox.at(-1)?.text ?? '')
    const ok = await fetch(`${service.origin}/login/email/finish`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({email, code}),
    })
    assert.equal(ok.status, 200)
    cookiePair(ok)
    const replay = await fetch(`${service.origin}/login/email/finish`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({email, code}),
    })
    assert.equal(replay.status, 400)
    assert.equal(
      ((await replay.json()) as {error: string}).error,
      'code-invalid',
    )
    const expiredStart = await fetch(`${service.origin}/login/email/start`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({email}),
    })
    assert.equal(expiredStart.status, 200)
    const expiredCode = codeFrom(service.app.mailbox.at(-1)?.text ?? '')
    clock.now += 16 * 60 * 1000
    const expired = await fetch(`${service.origin}/login/email/finish`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({email, code: expiredCode}),
    })
    assert.equal(expired.status, 400)
    const renewedStart = await fetch(`${service.origin}/login/email/start`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({email}),
    })
    assert.equal(renewedStart.status, 200)
    const renewed = await fetch(`${service.origin}/login/email/finish`, {
      method: 'POST',
      headers: browserHeaders({'content-type': 'application/json'}),
      body: JSON.stringify({
        email,
        code: codeFrom(service.app.mailbox.at(-1)?.text ?? ''),
      }),
    })
    assert.equal(renewed.status, 200)
    cookiePair(renewed)
  })
})

describe('password, handle, and configuration', () => {
  it('rate limits e-mail code requests', async () => {
    const clock: Clock = {now: Date.parse('2026-11-18T18:00:00Z')}
    const service = await boot(
      configFor(clock, {
        email: {from: 'AQUA <login@aqua.example>', transport: 'capture'},
        limits: {
          oauthStart: {limit: 5, windowMs: 15 * 60 * 1000},
          emailStart: {limit: 2, windowMs: 60 * 60 * 1000},
          emailFinish: {limit: 5, windowMs: 15 * 60 * 1000},
          password: {limit: 5, windowMs: 15 * 60 * 1000},
        },
      }),
    )
    try {
      const email = 'limited@example.com'
      const send = () =>
        fetch(`${service.origin}/login/email/start`, {
          method: 'POST',
          headers: browserHeaders({'content-type': 'application/json'}),
          body: JSON.stringify({email}),
        })
      assert.equal((await send()).status, 200)
      assert.equal((await send()).status, 200)
      assert.equal((await send()).status, 429)
      clock.now += 61 * 60 * 1000
      assert.equal((await send()).status, 200)
    } finally {
      await service.close()
    }
  })

  it('stores an AQUA password as argon2id and does not accept it for another account', async () => {
    const clock: Clock = {now: Date.parse('2026-11-18T15:00:00Z')}
    const draft = configFor(clock, {
      origin: 'http://127.0.0.1:9',
      passwordLogin: true,
      email: {from: 'AQUA <login@aqua.example>', transport: 'capture'},
    })
    const service = await boot(draft)
    try {
      const email = 'password-person@example.com'
      await fetch(`${service.origin}/login/email/start`, {
        method: 'POST',
        headers: browserHeaders({'content-type': 'application/json'}),
        body: JSON.stringify({email}),
      })
      const code = codeFrom(service.app.mailbox.at(-1)?.text ?? '')
      const logged = await fetch(`${service.origin}/login/email/finish`, {
        method: 'POST',
        headers: browserHeaders({'content-type': 'application/json'}),
        body: JSON.stringify({email, code}),
      })
      const cookie = cookiePair(logged)
      const session = (await (
        await fetch(`${service.origin}/session`, {headers: {cookie}})
      ).json()) as {csrfToken: string}
      const password = 'correct-horse-battery'
      const set = await fetch(`${service.origin}/password`, {
        method: 'POST',
        headers: browserHeaders({
          cookie,
          'content-type': 'application/json',
          'x-aqua-csrf': session.csrfToken,
        }),
        body: JSON.stringify({password}),
      })
      assert.equal(set.status, 200)
      const stored = dump(service.app)
      assert.equal(stored.includes(password), false)
      assert.match(stored, /\$argon2id\$/)
      await fetch(`${service.origin}/logout`, {
        method: 'POST',
        headers: browserHeaders({
          cookie,
          'content-type': 'application/json',
          'x-aqua-csrf': session.csrfToken,
        }),
        body: '{}',
      })
      const again = await fetch(`${service.origin}/login/password`, {
        method: 'POST',
        headers: browserHeaders({'content-type': 'application/json'}),
        body: JSON.stringify({email, password}),
      })
      assert.equal(again.status, 200)
      const wrong = await fetch(`${service.origin}/login/password`, {
        method: 'POST',
        headers: browserHeaders({'content-type': 'application/json'}),
        body: JSON.stringify({email, password: 'not-the-password'}),
      })
      assert.equal(wrong.status, 401)
      const other = await fetch(`${service.origin}/login/password`, {
        method: 'POST',
        headers: browserHeaders({'content-type': 'application/json'}),
        body: JSON.stringify({
          email: 'someone-else@example.com',
          password,
        }),
      })
      assert.equal(other.status, 401)
    } finally {
      await service.close()
    }
  })

  it('records a verified handle without changing the DID or the internal id', async () => {
    const clock: Clock = {now: Date.parse('2026-11-18T16:00:00Z')}
    const did = 'did:plc:alicealicealicealice'
    let pending = ''
    let wellKnown = did
    const draft = configFor(clock, {origin: 'http://127.0.0.1:9'})
    const service = await boot({
      ...draft,
      atprotoEnabled: true,
      atprotoClient: {
        clientMetadata: {client_id: 'test'},
        jwks: {keys: []},
        async authorize(_handle, options) {
          pending = options.state
          return new URL(`https://pds.example/authorize?state=${options.state}`)
        },
        async callback(params) {
          if (!pending || params.get('state') !== pending) {
            throw new Error('state mismatch')
          }
          pending = ''
          return {session: {did}, state: params.get('state')}
        },
        async revoke() {},
      },
      fetch: (async input => {
        const url = String(input)
        if (url.includes('.well-known/atproto-did')) {
          return new Response(wellKnown, {status: 200})
        }
        return new Response('missing', {status: 404})
      }) as typeof fetch,
    })
    try {
      const start = await fetch(
        `${service.origin}/login?handle=alice.bsky.social`,
        {redirect: 'manual'},
      )
      const location = new URL(start.headers.get('location') ?? '')
      const callback = await fetch(
        `${service.origin}/oauth/callback?code=abc&state=${location.searchParams.get('state')}`,
        {redirect: 'manual'},
      )
      assert.equal(callback.status, 302)
      const cookie = cookiePair(callback)
      const session = (await (
        await fetch(`${service.origin}/session`, {headers: {cookie}})
      ).json()) as {
        csrfToken: string
        authorization: {userId: string; did: string | null}
      }
      assert.equal(session.authorization.did, did)
      const claimed = await fetch(`${service.origin}/handle`, {
        method: 'POST',
        headers: browserHeaders({
          cookie,
          'content-type': 'application/json',
          'x-aqua-csrf': session.csrfToken,
        }),
        body: JSON.stringify({handle: 'Ada.own.example'}),
      })
      const body = (await claimed.json()) as {
        authorization: {userId: string; did: string | null}
        handle: string
      }
      assert.equal(claimed.status, 200)
      assert.equal(body.handle, 'ada.own.example')
      assert.equal(body.authorization.userId, session.authorization.userId)
      assert.equal(body.authorization.did, did)
      assert.deepEqual(Object.keys(body.authorization).sort(), [
        'did',
        'userId',
      ])
      wellKnown = 'did:plc:someoneelseelseelse'
      const mismatch = await fetch(`${service.origin}/handle`, {
        method: 'POST',
        headers: browserHeaders({
          cookie,
          'content-type': 'application/json',
          'x-aqua-csrf': session.csrfToken,
        }),
        body: JSON.stringify({handle: 'other.own.example'}),
      })
      assert.equal(mismatch.status, 400)
      const unchanged = (await (
        await fetch(`${service.origin}/session`, {headers: {cookie}})
      ).json()) as {
        user: {handle: string | null}
        authorization: {userId: string; did: string}
      }
      assert.equal(unchanged.user.handle, 'ada.own.example')
      assert.equal(unchanged.authorization.userId, session.authorization.userId)
      assert.equal(unchanged.authorization.did, did)
    } finally {
      await service.close()
    }
  })

  it('keeps the 616 network out of the service and refuses a half-configured provider', async () => {
    assert.equal(SERVICE_616_BOUNDARY.reads616Session, false)
    assert.equal(SERVICE_616_BOUNDARY.sharesBrowserSession, false)
    assert.equal(SERVICE_616_BOUNDARY.identityKey, 'did-or-internal-id')
    const base = {
      AQUA_IDENTITY_ORIGIN: 'https://identity.example',
      AQUA_IDENTITY_APP_ORIGINS: 'https://aqua.example',
      AQUA_IDENTITY_SESSION_SECRET: SECRET,
      AQUA_IDENTITY_GOOGLE_CLIENT_ID: 'google-client',
    }
    const hidden = readServiceConfig(base)
    assert.equal(hidden.ok, true)
    if (!hidden.ok) return
    assert.deepEqual(publicDirectory(hidden.config).providers, [])
    const shown = readServiceConfig({
      ...base,
      AQUA_IDENTITY_GOOGLE_CLIENT_SECRET: 'super-secret-value',
    })
    assert.equal(shown.ok, true)
    if (!shown.ok) return
    assert.deepEqual(publicDirectory(shown.config).providers, ['google'])
    assert.equal(
      JSON.stringify(publicDirectory(shown.config)).includes(
        'super-secret-value',
      ),
      false,
    )
    const production = readServiceConfig({
      ...base,
      NODE_ENV: 'production',
      AQUA_IDENTITY_OAUTH_ALLOW_INSECURE: 'true',
    })
    assert.equal(production.ok, false)
    const capture = readServiceConfig({
      ...base,
      NODE_ENV: 'production',
      AQUA_IDENTITY_EMAIL_FROM: 'login@aqua.example',
      AQUA_IDENTITY_EMAIL_TRANSPORT: 'capture',
    })
    assert.equal(capture.ok, false)
    const previous = process.exitCode
    const enabled = process.env.AQUA_IDENTITY_ENABLE_SERVER
    delete process.env.AQUA_IDENTITY_ENABLE_SERVER
    await main()
    assert.equal(process.exitCode, 1)
    process.exitCode = previous
    if (enabled) process.env.AQUA_IDENTITY_ENABLE_SERVER = enabled
  })
})

function codeFrom(text: string) {
  const match = text.match(/Seu código AQUA: (\S+)/)
  assert.ok(match?.[1])
  return match[1]
}

async function linkGithub(service: string, cookie: string, csrf: string) {
  const start = await fetch(
    `${service}/oauth/social/start?provider=github&intent=link&csrf=${encodeURIComponent(csrf)}`,
    {redirect: 'manual', headers: {cookie}},
  )
  assert.equal(start.status, 302)
  const authorize = new URL(start.headers.get('location') ?? '')
  const authorized = await fetch(authorize, {redirect: 'manual'})
  return fetch(authorized.headers.get('location') ?? '', {
    redirect: 'manual',
    headers: {cookie},
  })
}

function appleKey() {
  const {privateKey} = generateKeyPairSync('ec', {namedCurve: 'P-256'})
  return privateKey.export({type: 'pkcs8', format: 'pem'}).toString()
}
