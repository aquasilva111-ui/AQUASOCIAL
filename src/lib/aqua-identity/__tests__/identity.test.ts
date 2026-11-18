import {webcrypto} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'

import {assessAbuse} from '#/lib/aqua-identity/abuse'
import {
  assertDurableJson,
  DURABLE_KEY,
  EPHEMERAL_KEY,
  saveEphemeralPdsSession,
  upsertAccount,
  writeDurable,
} from '#/lib/aqua-identity/accounts'
import {
  IDENTITY_616_BOUNDARY,
  resourceRefForDid,
} from '#/lib/aqua-identity/boundary-616'
import {
  readAquaIdentityConfig,
  signupAvailability,
} from '#/lib/aqua-identity/config'
import {accountKey, parseIdentifier} from '#/lib/aqua-identity/did'
import {
  dnsTxtName,
  dnsTxtValue,
  verifyHandleDid,
  wellKnownBody,
} from '#/lib/aqua-identity/domain'
import {assertDpopBound, buildDpopProofClaims} from '#/lib/aqua-identity/dpop'
import {
  finalizeOAuthSignIn,
  prepareOAuthSignIn,
  readOAuthCallback,
} from '#/lib/aqua-identity/flow'
import {formatAquaHandle, planHandleChange} from '#/lib/aqua-identity/handles'
import {buildSessionCookie} from '#/lib/aqua-identity/http-cookie'
import {
  buildPublicClientMetadata,
  selectClientMetadata,
} from '#/lib/aqua-identity/metadata'
import {createNativeAccount, redactSecrets} from '#/lib/aqua-identity/pds'
import {consumePending, savePending} from '#/lib/aqua-identity/pending'
import {createCodeChallenge, createCodeVerifier} from '#/lib/aqua-identity/pkce'
import {SlidingWindowRateLimiter} from '#/lib/aqua-identity/rate-limit'
import {didWebUrl, resolveIdentity} from '#/lib/aqua-identity/resolve'
import {memoryStore} from '#/lib/aqua-identity/storage'

const require = createRequire(__filename)
const {buildPublicClientMetadata: buildMetadataScript} =
  require('../../../../scripts/aqua-oauth-metadata.js') as {
    buildPublicClientMetadata: (
      origin: string,
    ) => ReturnType<typeof buildPublicClientMetadata>
  }

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  })
}

const DID = 'did:plc:alicealicealicealice'
const PDS = 'https://pds.example'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  })
}

function didDoc(did = DID) {
  return {
    id: did,
    alsoKnownAs: ['at://alice.bsky.social'],
    service: [
      {
        id: '#atproto_pds',
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: PDS,
      },
    ],
  }
}

describe('AQUA Identity', () => {
  test('resolves a handle to a DID and uses the DID as the account key', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('resolveHandle')) return jsonResponse({did: DID})
      if (url.includes(DID)) return jsonResponse(didDoc())
      return new Response('missing', {status: 404})
    })
    const resolved = await resolveIdentity(
      '@Alice.bsky.social',
      {
        handleResolver: 'https://bsky.social',
        plcDirectoryUrl: 'https://plc.directory',
      },
      fetchImpl as typeof fetch,
    )
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(resolved.identity.did).toBe(DID)
    expect(resolved.identity.pdsUrl).toBe(PDS)
    expect(accountKey(resolved.identity)).toBe(DID)
    expect(accountKey(resolved.identity)).not.toBe(resolved.identity.handle)
  })

  test('resolves a DID without treating the handle as the key', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(didDoc()))
    const resolved = await resolveIdentity(
      DID,
      {
        handleResolver: 'https://bsky.social',
        plcDirectoryUrl: 'https://plc.directory',
      },
      fetchImpl as typeof fetch,
    )
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return
    expect(parseIdentifier('not a handle').kind).toBe('invalid')
    expect(didWebUrl('did:web:example.com')).toBe(
      'https://example.com/.well-known/did.json',
    )
    expect(didWebUrl('did:web:example.com:users:alice')).toBe(
      'https://example.com/users/alice/did.json',
    )
  })

  test('PKCE S256 is stable for one verifier', async () => {
    const verifier = createCodeVerifier()
    expect(verifier).not.toContain('=')
    expect(await createCodeChallenge(verifier)).toBe(
      await createCodeChallenge(verifier),
    )
    expect(await createCodeChallenge(verifier)).not.toBe(
      await createCodeChallenge(createCodeVerifier()),
    )
  })

  test('OAuth state is single-use, expires, and ignores a mismatched callback', async () => {
    const storage = memoryStore()
    const pending = {
      state: 'state-1',
      codeVerifier: 'verifier',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256' as const,
      createdAt: 1_000,
      expiresAt: 2_000,
      identifier: DID,
      expectedDid: DID,
      handle: 'alice.bsky.social',
      pdsUrl: PDS,
    }
    savePending(storage, pending)
    expect(consumePending(storage, 'other', 1_500)).toEqual({
      ok: false,
      reason: 'state-mismatch',
    })
    expect(consumePending(storage, 'state-1', 1_500).ok).toBe(true)
    expect(consumePending(storage, 'state-1', 1_500)).toEqual({
      ok: false,
      reason: 'state-reused',
    })

    const expired = memoryStore()
    savePending(expired, pending)
    expect(consumePending(expired, 'state-1', 3_000)).toEqual({
      ok: false,
      reason: 'state-expired',
    })
  })

  test('callback parsing reads the fragment and rejects a different DID', async () => {
    const params = readOAuthCallback(
      'https://aqua.example/oauth/callback#code=abc&state=state-1&iss=https%3A%2F%2Fpds.example',
    )
    expect(params).toMatchObject({code: 'abc', state: 'state-1'})

    const verifier = createCodeVerifier()
    const pending = {
      state: 'state-1',
      codeVerifier: verifier,
      codeChallenge: await createCodeChallenge(verifier),
      codeChallengeMethod: 'S256' as const,
      createdAt: 0,
      expiresAt: 10_000,
      identifier: DID,
      expectedDid: DID,
      handle: 'alice.bsky.social',
      pdsUrl: PDS,
    }
    const rejectedStore = memoryStore()
    savePending(rejectedStore, pending)
    const rejected = await finalizeOAuthSignIn({
      storage: rejectedStore,
      callbackUrl: 'https://aqua.example/oauth/callback?code=abc&state=state-1',
      sessionDid: 'did:plc:someoneelse',
      now: 1_000,
    })
    expect(rejected).toEqual({ok: false, reason: 'did-mismatch'})

    const pkceStore = memoryStore()
    savePending(pkceStore, {...pending, codeChallenge: 'tampered'})
    const pkce = await finalizeOAuthSignIn({
      storage: pkceStore,
      callbackUrl: 'https://aqua.example/oauth/callback?code=abc&state=state-1',
      sessionDid: DID,
      now: 1_000,
    })
    expect(pkce).toEqual({ok: false, reason: 'pkce-mismatch'})

    const acceptedStore = memoryStore()
    savePending(acceptedStore, pending)
    const accepted = await finalizeOAuthSignIn({
      storage: acceptedStore,
      callbackUrl: 'https://aqua.example/oauth/callback?code=abc&state=state-1',
      sessionDid: DID,
      returnedState: 'state-1',
      now: 1_000,
    })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.account).toEqual({
      did: DID,
      handle: 'alice.bsky.social',
      pdsUrl: PDS,
      method: 'oauth',
    })
    expect(JSON.stringify(accepted.account)).not.toMatch(/password/i)
  })

  test('signup stays off and does not call the PDS until the flag and URL exist', async () => {
    const fetchImpl = jest.fn()
    const limiter = new SlidingWindowRateLimiter(
      readAquaIdentityConfig({}).limits,
    )
    const base = {
      email: 'ada@example.com',
      password: 'not-stored-anywhere',
      localHandle: 'ada',
    }
    const off = await createNativeAccount({
      config: readAquaIdentityConfig({}),
      account: base,
      limiter,
      fetch: fetchImpl as typeof fetch,
    })
    expect(off).toEqual({ok: false, reason: 'pds-unset'})
    expect(
      signupAvailability(
        readAquaIdentityConfig({
          EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED: 'true',
        }),
      ),
    ).toEqual({enabled: false, reason: 'pds-unset'})
    expect(fetchImpl).not.toHaveBeenCalled()

    const disabled = await createNativeAccount({
      config: {
        ...readAquaIdentityConfig({EXPO_PUBLIC_AQUA_PDS_URL: PDS}),
        pdsSignupEnabled: false,
      },
      account: base,
      limiter,
      fetch: fetchImpl as typeof fetch,
    })
    expect(disabled).toEqual({ok: false, reason: 'pds-signup-disabled'})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  test('a configured PDS receives createAccount once and the password is not kept', async () => {
    let sentBody = ''
    const fetchImpl = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentBody = String(init?.body ?? '')
        return jsonResponse({
          did: DID,
          handle: 'ada.aqua.test',
          accessJwt: 'access-token',
          refreshJwt: 'refresh-token',
        })
      },
    )
    const config = {
      ...readAquaIdentityConfig({
        EXPO_PUBLIC_AQUA_PDS_URL: PDS,
        EXPO_PUBLIC_AQUA_PDS_SIGNUP_ENABLED: 'true',
        EXPO_PUBLIC_AQUA_HANDLE_DOMAIN: 'aqua.test',
      }),
    }
    const result = await createNativeAccount({
      config,
      account: {
        email: 'ada@example.com',
        password: 'correct-horse',
        localHandle: 'ada',
      },
      limiter: new SlidingWindowRateLimiter(config.limits),
      fetch: fetchImpl as typeof fetch,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = JSON.parse(sentBody) as {password?: string; handle?: string}
    expect(body.password).toBe('correct-horse')
    expect(body.handle).toBe('ada.aqua.test')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.account.did).toBe(DID)
    expect(JSON.stringify(result.account)).not.toContain('correct-horse')
    expect(result.ephemeral?.accessJwt).toBe('access-token')

    const storage = memoryStore()
    writeDurable(storage, upsertAccount({accounts: []}, result.account))
    expect(storage.get(DURABLE_KEY)).not.toContain('access-token')
    expect(storage.get(DURABLE_KEY)).not.toContain('correct-horse')
  })

  test('PDS errors that echo a password are redacted', async () => {
    const fetchImpl = jest.fn(
      async () => new Response('password=correct-horse', {status: 400}),
    )
    const config = {
      ...readAquaIdentityConfig({
        EXPO_PUBLIC_AQUA_PDS_URL: PDS,
        EXPO_PUBLIC_AQUA_HANDLE_DOMAIN: 'aqua.test',
      }),
      pdsSignupEnabled: true,
    }
    const result = await createNativeAccount({
      config,
      account: {
        email: 'ada@example.com',
        password: 'correct-horse',
        localHandle: 'ada',
      },
      limiter: new SlidingWindowRateLimiter(config.limits),
      fetch: fetchImpl as typeof fetch,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).not.toContain('correct-horse')
    expect(redactSecrets('password=correct-horse')).toBe('password=[redacted]')
  })

  test('rate limit, invite, and captcha fail closed', () => {
    let now = 0
    const limiter = new SlidingWindowRateLimiter(
      {login: {limit: 2, windowMs: 1_000}},
      () => now,
    )
    expect(limiter.consume('login', 'Ada').ok).toBe(true)
    expect(limiter.consume('login', 'ada').ok).toBe(true)
    expect(limiter.consume('login', 'ada')).toMatchObject({
      ok: false,
      reason: 'rate-limited',
    })
    now = 1_001
    expect(limiter.consume('login', 'ada').ok).toBe(true)

    const config = readAquaIdentityConfig({
      EXPO_PUBLIC_AQUA_IDENTITY_INVITE_REQUIRED: 'true',
      EXPO_PUBLIC_AQUA_IDENTITY_CAPTCHA_ENABLED: 'true',
    })
    expect(assessAbuse(config, {inviteCode: 'code'})).toEqual({
      ok: false,
      reason: 'captcha-required',
    })
    expect(
      assessAbuse(
        {...config, captchaSiteKey: 'site-key'},
        {inviteCode: '', captchaToken: 'token'},
      ),
    ).toEqual({ok: false, reason: 'invite-required'})
  })

  test('AQUA handles use the configured domain and keep the DID', () => {
    expect(formatAquaHandle('Ada', '')).toEqual({
      ok: false,
      reason: 'handle-domain-unset',
    })
    expect(formatAquaHandle('Ada', 'example.test')).toEqual({
      ok: true,
      handle: 'ada.example.test',
    })
    const plan = planHandleChange({
      did: DID,
      currentHandle: 'ada.example.test',
      nextHandle: 'ada.own.example',
    })
    expect(plan).toEqual({
      ok: true,
      did: DID,
      from: 'ada.example.test',
      to: 'ada.own.example',
      didUnchanged: true,
    })
    expect(dnsTxtName('ada.own.example')).toBe('_atproto.ada.own.example')
    expect(dnsTxtValue(DID)).toBe(`did=${DID}`)
    expect(wellKnownBody(DID)).toBe(DID)
  })

  test('custom domain verification accepts HTTPS or DNS TXT for the same DID', async () => {
    const https = jest.fn(async () => new Response(DID, {status: 200}))
    expect(
      await verifyHandleDid({
        handle: 'ada.own.example',
        expectedDid: DID,
        fetch: https as typeof fetch,
        dohUrl: 'https://doh.example/dns-query',
      }),
    ).toEqual({ok: true, method: 'https', did: DID})

    const dns = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('dns-query')) {
        return jsonResponse({Answer: [{data: `"did=${DID}"`}]})
      }
      return new Response('missing', {status: 404})
    })
    expect(
      await verifyHandleDid({
        handle: 'ada.own.example',
        expectedDid: DID,
        fetch: dns as typeof fetch,
        dohUrl: 'https://doh.example/dns-query',
      }),
    ).toEqual({ok: true, method: 'dns', did: DID})
  })

  test('public client metadata requires DPoP and matches the build script', () => {
    expect(buildPublicClientMetadata({origin: ''})).toBeUndefined()
    expect(
      selectClientMetadata(readAquaIdentityConfig({}), 'http://127.0.0.1:8081'),
    ).toBeUndefined()
    expect(
      selectClientMetadata(readAquaIdentityConfig({}), 'https://aqua.example'),
    ).toBe('unconfigured')
    const metadata = buildPublicClientMetadata({origin: 'https://aqua.example'})
    expect(metadata).toMatchObject({
      client_id: 'https://aqua.example/oauth/client-metadata.json',
      redirect_uris: ['https://aqua.example/oauth/callback'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true,
      scope: 'atproto transition:generic',
    })
    expect(buildMetadataScript('https://aqua.example')).toEqual(metadata)
    expect(() => assertDpopBound({dpop_bound_access_tokens: false})).toThrow(
      /DPoP/,
    )
    expect(
      buildDpopProofClaims({
        htm: 'post',
        htu: 'https://pds.example/oauth/token?x=1#frag',
        jti: 'jti',
        iat: 10,
      }).htu,
    ).toBe('https://pds.example/oauth/token')
  })

  test('the BFF cookie is HttpOnly and is not a token', () => {
    const cookie = buildSessionCookie('a'.repeat(22), {
      secure: true,
      maxAgeSeconds: 3600,
    })
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toMatch(/password|accessJwt|refresh/i)
    expect(() =>
      buildSessionCookie('short', {secure: true, maxAgeSeconds: 10}),
    ).toThrow(/opaque/)
  })

  test('durable storage refuses tokens and ephemeral storage drops a password', () => {
    expect(() => assertDurableJson('{"accessJwt":"x"}')).toThrow(/secrets/)
    expect(() => assertDurableJson('{"password":"x"}')).toThrow(/secrets/)
    const storage = memoryStore()
    const state = upsertAccount(
      {accounts: []},
      {
        did: DID,
        handle: 'old.example',
        pdsUrl: PDS,
        method: 'oauth',
      },
    )
    const renamed = upsertAccount(state, {
      ...state.accounts[0],
      handle: 'new.example',
    })
    expect(renamed.accounts).toHaveLength(1)
    expect(renamed.currentDid).toBe(DID)
    writeDurable(storage, renamed)
    saveEphemeralPdsSession(storage, {
      did: DID,
      accessJwt: 'jwt',
      // Extra fields are not part of the stored session.
      ...({password: 'nope'} as object),
    })
    expect(storage.get(EPHEMERAL_KEY)).not.toContain('nope')
    expect(storage.get(DURABLE_KEY)).toContain(DID)
    expect(storage.get(DURABLE_KEY)).not.toContain('jwt')
  })

  test('616 stays a DID reference and the module does not import auth', () => {
    expect(IDENTITY_616_BOUNDARY.identityDependsOn616).toBe(false)
    expect(IDENTITY_616_BOUNDARY.privateDataOnChain).toBe(false)
    const ref = resourceRefForDid(DID, 'resource-1')
    expect(Object.keys(ref).sort()).toEqual(['did', 'resourceId'])
    const source = readFileSync(join(__dirname, '../boundary-616.ts'), 'utf8')
    expect(source).not.toMatch(/^import /m)
    expect(source).not.toMatch(/oauth-client|createAccount|accessJwt/)
  })

  test('sign-in preparation binds the resolved DID before redirect', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('resolveHandle')) return jsonResponse({did: DID})
      return jsonResponse(didDoc())
    })
    const prepared = await prepareOAuthSignIn({
      identifier: 'alice.bsky.social',
      config: readAquaIdentityConfig({}),
      limiter: new SlidingWindowRateLimiter({
        login: {limit: 5, windowMs: 1_000},
      }),
      fetch: fetchImpl as typeof fetch,
      now: 50,
    })
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(prepared.pending.identifier).toBe(DID)
    expect(prepared.pending.expectedDid).toBe(DID)
    expect(prepared.pending.codeChallenge).toBe(
      await createCodeChallenge(prepared.pending.codeVerifier),
    )
  })
})
