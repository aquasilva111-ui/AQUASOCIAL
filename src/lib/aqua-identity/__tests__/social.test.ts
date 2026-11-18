import {readAquaIdentityConfig} from '#/lib/aqua-identity/config'
import {
  atprotoServiceLoginUrl,
  loadSocialDirectory,
  parseSocialDirectory,
  postIdentityService,
  readSocialError,
  socialAuthorizeUrl,
} from '#/lib/aqua-identity/social'

describe('social login directory', () => {
  test('an empty service URL shows no external providers', async () => {
    const fetchImpl = jest.fn()
    const directory = await loadSocialDirectory(
      '',
      fetchImpl as unknown as typeof fetch,
    )
    expect(directory).toEqual({providers: [], atproto: false})
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(readAquaIdentityConfig({}).serviceUrl).toBe('')
  })

  test('only configured providers are kept, and secrets in the payload are ignored', () => {
    const directory = parseSocialDirectory({
      providers: ['google', 'mystery', 'email', 'google'],
      atproto: true,
      clientSecret: 'do-not-keep',
    })
    expect(directory).toEqual({
      providers: ['google', 'email'],
      atproto: true,
    })
    expect(JSON.stringify(directory)).not.toContain('do-not-keep')
    expect(readSocialError('?social_error=token-invalid')).toBe('token-invalid')
    expect(readSocialError('?social_error=https://evil.example')).toBe('')
  })

  test('a failed directory request leaves Bluesky as the only visible path', async () => {
    const fetchImpl = jest.fn(async () => new Response('nope', {status: 503}))
    const directory = await loadSocialDirectory(
      'https://identity.example',
      fetchImpl as unknown as typeof fetch,
    )
    expect(directory.providers).toEqual([])
    expect(
      socialAuthorizeUrl('https://identity.example', 'google', 'login'),
    ).toBe(
      'https://identity.example/oauth/social/start?provider=google&intent=login',
    )
    expect(
      atprotoServiceLoginUrl('https://identity.example', 'alice.bsky.social'),
    ).toBe('https://identity.example/login?handle=alice.bsky.social')
  })

  test('the browser post carries the CSRF header and not the secret in the URL', async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(JSON.stringify({ok: true}), {
          headers: {'content-type': 'application/json'},
        }),
    )
    await postIdentityService(
      'https://identity.example',
      '/identities/unlink',
      {provider: 'github'},
      'csrf-token',
      fetchImpl as unknown as typeof fetch,
    )
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('https://identity.example/identities/unlink')
    expect(String(url)).not.toContain('csrf-token')
    const headers = init.headers as Record<string, string>
    expect(headers['x-aqua-csrf']).toBe('csrf-token')
    expect(headers['x-aqua-client']).toBe('aqua-identity')
    expect(init.credentials).toBe('include')
    expect(init.body).toBe('{"provider":"github"}')
  })
})
