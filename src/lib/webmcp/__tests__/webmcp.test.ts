import {describe, expect, it, jest} from '@jest/globals'

import {DISCOVER_FEED_URI} from '#/lib/constants'
import {installWebMcpTools} from '#/lib/webmcp/install'
import {
  canonicalPublicFeed,
  PRA_VOCE_FEED_DESCRIPTOR,
  resolvePublicRoute,
} from '#/lib/webmcp/navigation'
import {
  type FetchLike,
  getPublicProfile,
  pickPublicActor,
  pickPublicPost,
  searchPublicActors,
  searchPublicPosts,
} from '#/lib/webmcp/public-api'
import {
  collectModelContexts,
  registerWebMcpOnLoad,
  resetWebMcpRegistrationForTests,
} from '#/lib/webmcp/register'
import {
  buildWebMcpTools,
  WEB_MCP_TOOL_NAMES,
  type WebMcpDeps,
} from '#/lib/webmcp/tools'
import {type WebMcpModelContext, type WebMcpTool} from '#/lib/webmcp/types'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function mockFetch(body: unknown, status = 200) {
  const calls: {url: string; init?: RequestInit}[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({url, init})
    return jsonResponse(body, status)
  }
  return {calls, fetchImpl}
}

function deps(overrides: Partial<WebMcpDeps> = {}) {
  return {
    searchPosts: jest.fn<WebMcpDeps['searchPosts']>(async () => ({
      ok: true,
      value: [],
    })),
    searchActors: jest.fn<WebMcpDeps['searchActors']>(async () => ({
      ok: true,
      value: [],
    })),
    getProfile: jest.fn<WebMcpDeps['getProfile']>(async () => ({
      ok: false,
      error: 'missing',
    })),
    openRoute: jest.fn<WebMcpDeps['openRoute']>(async () => {}),
    selectHomeFeed: jest.fn<WebMcpDeps['selectHomeFeed']>(),
    ...overrides,
  }
}

function tool(tools: WebMcpTool[], name: string): WebMcpTool {
  const found = tools.find(item => item.name === name)
  if (!found) throw new Error(`missing tool ${name}`)
  return found
}

describe('WebMCP registration', () => {
  it('registers nothing when the browser has no model context', () => {
    expect(collectModelContexts({navigator: {}, document: {}})).toEqual([])
    expect(collectModelContexts()).toEqual([])
  })

  it('registers on navigator.modelContext when that is the only surface', async () => {
    resetWebMcpRegistrationForTests()
    const registerTool = jest.fn<WebMcpModelContext['registerTool']>()
    const context = {registerTool}
    const result = await registerWebMcpOnLoad({
      isWeb: true,
      contexts: collectModelContexts({navigator: {modelContext: context}}),
      deps: deps(),
    })
    expect(result.registered).toEqual([...WEB_MCP_TOOL_NAMES])
    expect(registerTool).toHaveBeenCalledTimes(WEB_MCP_TOOL_NAMES.length)
    const names = registerTool.mock.calls.map(call => call[0].name)
    expect(names).toEqual([...WEB_MCP_TOOL_NAMES])
  })

  it('registers on document.modelContext when navigator has none', async () => {
    resetWebMcpRegistrationForTests()
    const registerTool = jest.fn(async () => {})
    const context = {registerTool}
    const result = await registerWebMcpOnLoad({
      isWeb: true,
      contexts: collectModelContexts({
        navigator: {},
        document: {modelContext: context},
      }),
      deps: deps(),
    })
    expect(result.registered).toEqual([...WEB_MCP_TOOL_NAMES])
    expect(registerTool).toHaveBeenCalledTimes(WEB_MCP_TOOL_NAMES.length)
  })

  it('registers on both surfaces when they are different objects', async () => {
    resetWebMcpRegistrationForTests()
    const navigatorContext = {registerTool: jest.fn()}
    const documentContext = {registerTool: jest.fn(async () => {})}
    const contexts = collectModelContexts({
      navigator: {modelContext: navigatorContext},
      document: {modelContext: documentContext},
    })
    expect(contexts).toHaveLength(2)
    await registerWebMcpOnLoad({isWeb: true, contexts, deps: deps()})
    expect(navigatorContext.registerTool).toHaveBeenCalledTimes(5)
    expect(documentContext.registerTool).toHaveBeenCalledTimes(5)
  })

  it('registers once when both surfaces are the same object', async () => {
    resetWebMcpRegistrationForTests()
    const context = {registerTool: jest.fn()}
    const contexts = collectModelContexts({
      navigator: {modelContext: context},
      document: {modelContext: context},
    })
    expect(contexts).toEqual([context])
    await registerWebMcpOnLoad({isWeb: true, contexts, deps: deps()})
    expect(context.registerTool).toHaveBeenCalledTimes(5)
    await registerWebMcpOnLoad({isWeb: true, contexts, deps: deps()})
    expect(context.registerTool).toHaveBeenCalledTimes(5)
  })

  it('skips a model context that has no registerTool function', () => {
    expect(
      collectModelContexts({
        navigator: {modelContext: {unregisterTool() {}}},
        document: {modelContext: null},
      }),
    ).toEqual([])
  })

  it('does not throw when registerTool throws or rejects', async () => {
    resetWebMcpRegistrationForTests()
    const rejections: unknown[] = []
    const onRejection = (err: unknown) => {
      rejections.push(err)
    }
    process.on('unhandledRejection', onRejection)
    const context: WebMcpModelContext = {
      registerTool(candidate) {
        if (candidate.name === 'search_posts') throw new Error('sync')
        if (candidate.name === 'search_users')
          return Promise.reject(new Error('async'))
      },
    }
    const result = await registerWebMcpOnLoad({
      isWeb: true,
      contexts: [context],
      deps: deps(),
    })
    await new Promise(resolve => setImmediate(resolve))
    process.off('unhandledRejection', onRejection)
    expect(rejections).toEqual([])
    expect(result.registered).toEqual([
      'open_profile',
      'open_feed',
      'navigate_to',
    ])
  })

  it('is a no-op when installation is not on the web', async () => {
    resetWebMcpRegistrationForTests()
    const registerTool = jest.fn<WebMcpModelContext['registerTool']>()
    const result = await registerWebMcpOnLoad({
      isWeb: false,
      contexts: [{registerTool}],
      deps: deps(),
    })
    expect(result).toEqual({registered: []})
    expect(registerTool).not.toHaveBeenCalled()
    expect(() => installWebMcpTools()).not.toThrow()
  })

  it('gives every tool a name, description, JSON schema, and execute', () => {
    const tools = buildWebMcpTools(deps())
    expect(tools.map(item => item.name)).toEqual([...WEB_MCP_TOOL_NAMES])
    for (const item of tools) {
      expect(item.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/)
      expect(item.description.length).toBeGreaterThan(0)
      expect(item.inputSchema.type).toBe('object')
      expect(typeof item.execute).toBe('function')
      expect(JSON.parse(JSON.stringify(item.inputSchema))).toEqual(
        item.inputSchema,
      )
      expect(item.annotations.readOnlyHint).toBe(true)
    }
  })
})

describe('public AppView results', () => {
  it('searches posts without sending credentials and drops viewer state', async () => {
    const {calls, fetchImpl} = mockFetch({
      posts: [
        {
          uri: 'at://did:plc:author/app.bsky.feed.post/3k',
          author: {
            did: 'did:plc:author',
            handle: 'ada.bsky.social',
            displayName: 'Ada',
            description: 'hi',
            viewer: {muted: true, following: 'secret'},
          },
          record: {text: 'oceano', createdAt: '2026-01-01T00:00:00.000Z'},
          likeCount: 2,
          replyCount: 1,
          repostCount: 0,
          viewer: {like: 'at://secret'},
        },
      ],
    })
    const result = await searchPublicPosts('oceano', {
      limit: 8,
      sort: 'latest',
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      {
        uri: 'at://did:plc:author/app.bsky.feed.post/3k',
        text: 'oceano',
        createdAt: '2026-01-01T00:00:00.000Z',
        author: {
          did: 'did:plc:author',
          handle: 'ada.bsky.social',
          displayName: 'Ada',
        },
        likeCount: 2,
        replyCount: 1,
        repostCount: 0,
        path: '/profile/ada.bsky.social/post/3k',
      },
    ])
    expect(JSON.stringify(result.value)).not.toContain('viewer')
    expect(JSON.stringify(result.value)).not.toContain('secret')
    expect(calls[0].url).toContain(
      'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts',
    )
    expect(calls[0].url).toContain('q=oceano')
    expect(calls[0].url).toContain('sort=latest')
    expect(calls[0].init?.credentials).toBe('omit')
  })

  it('searches actors and loads a profile from the same public service', async () => {
    const actors = mockFetch({
      actors: [
        {
          did: 'did:plc:author',
          handle: 'ada.bsky.social',
          displayName: 'Ada',
          viewer: {blockedBy: true},
        },
      ],
    })
    const found = await searchPublicActors('ada', {
      limit: 5,
      fetchImpl: actors.fetchImpl,
    })
    expect(found.ok).toBe(true)
    if (!found.ok) return
    expect(found.value[0]).toEqual({
      did: 'did:plc:author',
      handle: 'ada.bsky.social',
      displayName: 'Ada',
      description: null,
      path: '/profile/ada.bsky.social',
    })
    expect(actors.calls[0].url).toContain(
      '/xrpc/app.bsky.actor.searchActors?q=ada&limit=5',
    )

    const profile = mockFetch({
      did: 'did:plc:author',
      handle: 'ada.bsky.social',
      description: 'public bio',
      viewer: {muted: true},
    })
    const loaded = await getPublicProfile('ada.bsky.social', {
      fetchImpl: profile.fetchImpl,
    })
    expect(loaded).toEqual({
      ok: true,
      value: {
        did: 'did:plc:author',
        handle: 'ada.bsky.social',
        displayName: null,
        description: 'public bio',
        path: '/profile/ada.bsky.social',
      },
    })
    expect(profile.calls[0].url).toContain('app.bsky.actor.getProfile')
    expect(profile.calls[0].url).toContain('actor=ada.bsky.social')
  })

  it('returns an error payload when the AppView fails', async () => {
    const {fetchImpl} = mockFetch({message: 'Upstream exploded'}, 500)
    const result = await searchPublicPosts('oceano', {
      limit: 8,
      sort: 'top',
      fetchImpl,
    })
    expect(result).toEqual({
      ok: false,
      error:
        'The public AppView could not search posts (500): Upstream exploded',
    })
  })

  it('keeps only public fields when a record is shaped by hand', () => {
    expect(
      pickPublicActor({
        did: 'did:plc:author',
        handle: 'ada.bsky.social',
        viewer: {following: 'at://secret'},
      })?.path,
    ).toBe('/profile/ada.bsky.social')
    expect(pickPublicPost({uri: 'at://x', author: {viewer: {}}})).toBeNull()
  })
})

describe('WebMCP tool behavior', () => {
  it('searches posts and refuses an empty query without calling the network', async () => {
    const client = deps()
    const tools = buildWebMcpTools(client)
    expect(await tool(tools, 'search_posts').execute({query: '  '})).toEqual({
      error: 'Query is empty.',
    })
    expect(client.searchPosts).not.toHaveBeenCalled()

    const searchPosts = jest.fn<WebMcpDeps['searchPosts']>(async () => ({
      ok: true,
      value: [
        {
          uri: 'at://did:plc:author/app.bsky.feed.post/3k',
          text: 'oceano',
          createdAt: null,
          author: {
            did: 'did:plc:author',
            handle: 'ada.bsky.social',
            displayName: null,
          },
          replyCount: null,
          repostCount: null,
          likeCount: null,
          path: '/profile/ada.bsky.social/post/3k',
        },
      ],
    }))
    const result = await tool(
      buildWebMcpTools(deps({searchPosts})),
      'search_posts',
    ).execute({
      query: ' oceano ',
      limit: 100,
      sort: 'top',
    })
    expect(searchPosts).toHaveBeenCalledWith('oceano', {
      limit: 25,
      sort: 'top',
      signal: undefined,
    })
    expect(result).toMatchObject({posts: [{text: 'oceano'}]})
  })

  it('opens a public profile and still returns the profile if navigation is the point', async () => {
    const client = deps({
      getProfile: jest.fn(async () => ({
        ok: true as const,
        value: {
          did: 'did:plc:author',
          handle: 'ada.bsky.social',
          displayName: 'Ada',
          description: null,
          path: '/profile/ada.bsky.social',
        },
      })),
    })
    const tools = buildWebMcpTools(client)
    const result = await tool(tools, 'open_profile').execute({
      actor: '@ada.bsky.social',
    })
    expect(client.openRoute).toHaveBeenCalledWith('Profile', {
      name: 'ada.bsky.social',
    })
    expect(result).toMatchObject({
      opened: true,
      path: '/profile/ada.bsky.social',
      profile: {handle: 'ada.bsky.social'},
    })
    expect(
      await tool(tools, 'open_profile').execute({actor: '../messages'}),
    ).toEqual({error: 'That handle or DID is not valid.'})
    expect(client.openRoute).toHaveBeenCalledTimes(1)
  })

  it('opens Pra você and /books, and refuses the following feed', async () => {
    const client = deps()
    const tools = buildWebMcpTools(client)
    const openFeed = tool(tools, 'open_feed')
    expect(await openFeed.execute({feed: 'Pra você'})).toEqual({
      opened: true,
      feed: 'pra-voce',
      path: '/',
      feedDescriptor: PRA_VOCE_FEED_DESCRIPTOR,
    })
    expect(client.selectHomeFeed).toHaveBeenCalledWith(PRA_VOCE_FEED_DESCRIPTOR)
    expect(PRA_VOCE_FEED_DESCRIPTOR).toBe(`feedgen|${DISCOVER_FEED_URI}`)
    expect(client.openRoute).toHaveBeenCalledWith('Home', {})

    expect(await openFeed.execute({feed: 'books'})).toMatchObject({
      opened: true,
      feed: 'books',
      path: '/books',
    })
    expect(client.openRoute).toHaveBeenCalledWith('Books', {})
    expect(client.selectHomeFeed).toHaveBeenCalledTimes(1)

    expect(await openFeed.execute({feed: 'seguindo'})).toMatchObject({
      error: expect.stringContaining('not public'),
    })
    expect(client.openRoute).toHaveBeenCalledTimes(2)
  })

  it('navigates to public routes and refuses messages, settings, adult, and compose', async () => {
    const client = deps()
    const navigateTo = tool(buildWebMcpTools(client), 'navigate_to')
    expect(await navigateTo.execute({path: '/search?q=oceano'})).toEqual({
      opened: true,
      path: '/search?q=oceano',
      screen: 'Search',
    })
    expect(client.openRoute).toHaveBeenCalledWith('Search', {q: 'oceano'})

    for (const path of [
      '/messages',
      '/messages/inbox',
      '/settings',
      '/settings/account',
      '/notifications',
      '/moderation',
      '/sys/debug',
      '/saved',
      '/adult',
      '/adult/feed',
      '/ui-ai',
      '/books/compose',
      '/books/studio',
      '/docs',
      '/views/golive',
      '/views/mine',
      'https://evil.example/books',
      '//evil.example/books',
      '/books/../messages',
      '/books/%2e%2e/messages',
    ]) {
      const result = await navigateTo.execute({path})
      expect(result).toMatchObject({error: expect.any(String)})
    }
    expect(client.openRoute).toHaveBeenCalledTimes(1)
  })

  it('accepts the public sections used by open_feed', () => {
    expect(canonicalPublicFeed('Para Você')).toBe('pra-voce')
    expect(canonicalPublicFeed('for you')).toBe('pra-voce')
    expect(canonicalPublicFeed('following')).toBeNull()
    expect(resolvePublicRoute('/hashtag/aqua').ok).toBe(true)
    expect(resolvePublicRoute('/wiki').ok).toBe(true)
    expect(resolvePublicRoute('/noticias').ok).toBe(true)
    expect(resolvePublicRoute('/this-route-does-not-exist').ok).toBe(false)
  })

  it('turns a thrown dependency into an error payload', async () => {
    const client = deps({
      searchActors: jest.fn(async () => {
        throw new Error('boom')
      }),
    })
    const result = await tool(buildWebMcpTools(client), 'search_users').execute(
      {
        query: 'ada',
      },
    )
    expect(result).toEqual({error: 'The tool failed.'})
  })
})
