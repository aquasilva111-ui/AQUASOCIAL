import {
  ensureSitemapIndex,
  hasBlockedPublicLabel,
  isHiddenPostRecord,
  isPublicRepo,
  loadAquaSitemap,
  postSitemapUrl,
  profileSitemapUrl,
  renderUrlSet,
  SITEMAP_URL_LIMIT,
} from '#/lib/aqua-sitemap'

const PDS = 'https://pds.example.test'
const APP = 'https://appview.example.test'
const DID = 'did:plc:aqua'
const PROFILE = 'https://aquaapp.systems/profile/ada.aquaapp.online'
const POST_OK = `${PROFILE}/post/3ok`

type Row = {url: string; status?: number; body: unknown}

function response(status: number, body: unknown) {
  return {ok: status >= 200 && status < 300, status, json: async () => body}
}

function router(rows: Row[]) {
  return async (url: string) => {
    const row = rows.find(item => url.includes(item.url))
    if (!row) return response(500, {error: 'Unhandled', url})
    return response(row.status ?? 200, row.body)
  }
}

function repo(did: string, extra: Record<string, unknown> = {}) {
  return {did, head: 'bafyrei', rev: '3', active: true, ...extra}
}

function described(handle: string, extra: Record<string, unknown> = {}) {
  return {handle, did: DID, handleIsCorrect: true, ...extra}
}

function profileRecord(labels: string[] = []) {
  return {
    uri: `at://${DID}/app.bsky.actor.profile/self`,
    value: {
      $type: 'app.bsky.actor.profile',
      labels: {values: labels.map(val => ({val}))},
    },
  }
}

function postRecord(
  rkey: string,
  labels: string[] = [],
  extra: Record<string, unknown> = {},
) {
  return {
    uri: `at://${DID}/app.bsky.feed.post/${rkey}`,
    value: {
      $type: 'app.bsky.feed.post',
      text: 'oi',
      labels: {values: labels.map(val => ({val}))},
    },
    ...extra,
  }
}

function baseRows(overrides?: {
  repos?: unknown[]
  repoCursor?: string
  handle?: string
  describe?: Record<string, unknown>
  profileStatus?: number
  profile?: unknown
  records?: unknown[]
  recordCursor?: string
  appProfile?: unknown
  appProfileStatus?: number
  appPosts?: unknown[]
  appPostsStatus?: number
}): Row[] {
  const handle = overrides?.handle ?? 'ada.aquaapp.online'
  return [
    {
      url: 'listRepos',
      body: {
        repos: overrides?.repos ?? [repo(DID)],
        cursor: overrides?.repoCursor,
      },
    },
    {
      url: `describeRepo?repo=${encodeURIComponent(DID)}`,
      body: overrides?.describe ?? described(handle),
    },
    {
      url: 'app.bsky.actor.profile',
      status: overrides?.profileStatus ?? 200,
      body: overrides?.profile ?? profileRecord(),
    },
    {
      url: 'getProfile',
      status: overrides?.appProfileStatus ?? 200,
      body: overrides?.appProfile ?? {handle, labels: []},
    },
    {
      url: 'listRecords',
      body: {
        records: overrides?.records ?? [postRecord('3ok')],
        cursor: overrides?.recordCursor,
      },
    },
    {
      url: 'getPosts',
      status: overrides?.appPostsStatus ?? 200,
      body: {posts: overrides?.appPosts ?? []},
    },
  ]
}

async function load(rows: Row[], limit?: number) {
  return loadAquaSitemap({
    pdsOrigin: PDS,
    appViewOrigin: APP,
    limit,
    fetchImpl: router(rows),
  })
}

describe('aqua sitemap', () => {
  it('lists a public profile and post from the PDS', async () => {
    const listed = await load(baseRows())
    expect(listed.warning).toBeUndefined()
    expect(listed.profiles).toEqual([PROFILE])
    expect(listed.posts).toEqual([POST_OK])
    expect(renderUrlSet(listed.posts)).toContain(`<loc>${POST_OK}</loc>`)
    expect(renderUrlSet(listed.posts)).not.toContain('/adult')
  })

  it('follows repo and record cursors', async () => {
    const second = 'did:plc:other'
    const calls: string[] = []
    const fetchImpl = async (url: string) => {
      calls.push(url)
      if (url.includes('listRepos') && !url.includes('cursor=')) {
        return response(200, {
          repos: [repo(DID)],
          cursor: 'page-2',
        })
      }
      if (url.includes('listRepos') && url.includes('cursor=page-2')) {
        return response(200, {repos: [repo(second)]})
      }
      if (
        url.includes('describeRepo') &&
        url.includes(encodeURIComponent(second))
      ) {
        return response(200, described('bia.aquaapp.online'))
      }
      if (url.includes('describeRepo')) {
        return response(200, described('ada.aquaapp.online'))
      }
      if (url.includes('getRecord')) return response(200, profileRecord())
      if (url.includes('getProfile')) return response(200, {labels: []})
      if (
        url.includes('listRecords') &&
        url.includes(encodeURIComponent(DID)) &&
        !url.includes('cursor=')
      ) {
        return response(200, {
          records: [postRecord('3ok')],
          cursor: 'post-2',
        })
      }
      if (url.includes('listRecords') && url.includes('cursor=post-2')) {
        return response(200, {records: [postRecord('3next')]})
      }
      if (url.includes('listRecords')) {
        return response(200, {records: [postRecord('3bia')]})
      }
      if (url.includes('getPosts')) return response(200, {posts: []})
      return response(500, {})
    }
    const listed = await loadAquaSitemap({
      pdsOrigin: PDS,
      appViewOrigin: APP,
      fetchImpl,
    })
    expect(listed.profiles).toEqual([
      PROFILE,
      'https://aquaapp.systems/profile/bia.aquaapp.online',
    ])
    expect(listed.posts).toEqual([
      POST_OK,
      `${PROFILE}/post/3next`,
      'https://aquaapp.systems/profile/bia.aquaapp.online/post/3bia',
    ])
    expect(calls.some(url => url.includes('cursor=page-2'))).toBe(true)
    expect(calls.some(url => url.includes('cursor=post-2'))).toBe(true)
  })

  it('leaves the lists empty when the PDS does not answer', async () => {
    const down = await loadAquaSitemap({
      pdsOrigin: PDS,
      fetchImpl: async () => {
        throw new Error('network down')
      },
    })
    expect(down.posts).toEqual([])
    expect(down.profiles).toEqual([])
    expect(down.warning).toMatch(/PDS request failed/)

    const http = await load([
      {url: 'listRepos', status: 503, body: {error: 'Upstream'}},
    ])
    expect(http.posts).toEqual([])
    expect(http.profiles).toEqual([])
    expect(http.warning).toMatch(/503/)
  })

  it('skips deactivated and takedown accounts', async () => {
    expect(isPublicRepo(repo(DID, {active: false}))).toBe(false)
    expect(isPublicRepo(repo(DID, {active: true, status: 'takendown'}))).toBe(
      false,
    )
    expect(isPublicRepo(repo(DID, {status: 'deactivated'}))).toBe(false)
    expect(isPublicRepo(repo(DID, {status: 'suspended'}))).toBe(false)
    expect(isPublicRepo(repo(DID, {status: 'deleted'}))).toBe(false)
    const listed = await load(
      baseRows({
        repos: [
          repo(DID, {active: false, status: 'deactivated'}),
          repo('did:plc:down', {active: false, status: 'takendown'}),
          repo('did:plc:gone', {status: 'deleted'}),
        ],
      }),
    )
    expect(listed.profiles).toEqual([])
    expect(listed.posts).toEqual([])
  })

  it('skips an account that opted out of logged-out viewers', async () => {
    const self = await load(
      baseRows({profile: profileRecord(['!no-unauthenticated'])}),
    )
    expect(self.profiles).toEqual([])
    expect(self.posts).toEqual([])

    const moderated = await load(
      baseRows({
        appProfile: {
          handle: 'ada.aquaapp.online',
          labels: [{val: '!no-unauthenticated'}],
        },
      }),
    )
    expect(moderated.profiles).toEqual([])
    expect(moderated.posts).toEqual([])
    expect(
      hasBlockedPublicLabel({labels: [{val: '!no-unauthenticated'}]}),
    ).toBe(true)
  })

  it('skips Aqua+18 profiles and posts with adult labels', async () => {
    const profile = await load(baseRows({profile: profileRecord(['porn'])}))
    expect(profile.profiles).toEqual([])
    expect(profile.posts).toEqual([])

    for (const label of [
      'sexual',
      'nudity',
      'graphic-media',
      'porn',
    ] as const) {
      const posts = await load(
        baseRows({
          records: [postRecord('3ok'), postRecord('3no', [label])],
        }),
      )
      expect(posts.profiles).toEqual([PROFILE])
      expect(posts.posts).toEqual([POST_OK])
    }
    expect(profileSitemapUrl('ada.aquaapp.online')).not.toContain('/adult')
    expect(postSitemapUrl('ada.aquaapp.online', '3ok')).not.toContain('/adult')
  })

  it('skips deleted posts and posts hidden by moderation', async () => {
    expect(isHiddenPostRecord({uri: 'at://x', deleted: true, value: {}})).toBe(
      true,
    )
    expect(isHiddenPostRecord({uri: 'at://x', value: null})).toBe(true)
    expect(
      isHiddenPostRecord({
        uri: 'at://x',
        status: 'takendown',
        value: {$type: 'app.bsky.feed.post'},
      }),
    ).toBe(true)
    expect(
      isHiddenPostRecord(postRecord('3hide', [], {takedownRef: 'mod'})),
    ).toBe(true)

    const listed = await load(
      baseRows({
        records: [
          postRecord('3ok'),
          postRecord('3gone', [], {deleted: true}),
          {uri: `at://${DID}/app.bsky.feed.post/3null`, value: null},
          postRecord('3down', [], {status: 'takendown'}),
          postRecord('3hide', ['!hide']),
        ],
        appPosts: [
          {
            uri: `at://${DID}/app.bsky.feed.post/3ok`,
            labels: [{val: '!hide'}],
            record: {text: 'oi'},
          },
        ],
      }),
    )
    expect(listed.profiles).toEqual([PROFILE])
    expect(listed.posts).toEqual([])
  })

  it('keeps a clean post when the AppView hides only another one', async () => {
    const listed = await load(
      baseRows({
        records: [postRecord('3ok'), postRecord('3mod')],
        appPosts: [
          {
            uri: `at://${DID}/app.bsky.feed.post/3mod`,
            labels: [{val: '!hide'}],
          },
        ],
      }),
    )
    expect(listed.posts).toEqual([POST_OK])
  })

  it('drops Bluesky handles, broken handles, and a wrong handle', async () => {
    expect(profileSitemapUrl('ada.bsky.social')).toBeUndefined()
    expect(postSitemapUrl('ada.bsky.app', '3ok')).toBeUndefined()
    expect(profileSitemapUrl('handle.invalid')).toBeUndefined()
    const listed = await load(
      baseRows({
        handle: 'ada.bsky.social',
        describe: described('ada.bsky.team', {handleIsCorrect: false}),
      }),
    )
    expect(listed.profiles).toEqual([])
    expect(listed.posts).toEqual([])
  })

  it('skips an account the AppView says was taken down', async () => {
    const listed = await load(
      baseRows({
        appProfileStatus: 400,
        appProfile: {error: 'AccountTakedown'},
      }),
    )
    expect(listed.profiles).toEqual([])
    expect(listed.posts).toEqual([])
  })

  it('still lists PDS records when the AppView is down', async () => {
    const listed = await load(
      baseRows({
        appProfileStatus: 503,
        appProfile: {},
        appPostsStatus: 503,
        appPosts: {},
      }),
    )
    expect(listed.profiles).toEqual([PROFILE])
    expect(listed.posts).toEqual([POST_OK])
    expect(listed.warning).toMatch(/AppView/)
  })

  it('caps each file and escapes sitemap XML', async () => {
    const urls = Array.from({length: 3}, (_, index) => {
      return `https://aquaapp.systems/profile/ada.aquaapp.online/post/3k${index}`
    })
    const listed = await load(
      baseRows({
        records: urls.map((_, index) => postRecord(`3k${index}`)),
      }),
      2,
    )
    expect(listed.profiles).toHaveLength(1)
    expect(listed.posts).toHaveLength(2)
    expect(listed.warning).toMatch(/truncated/)
    expect(SITEMAP_URL_LIMIT).toBe(50000)
    const xml = renderUrlSet([
      'https://aquaapp.systems/profile/a&b.example/post/3ok',
    ])
    expect(xml).toContain(
      '<loc>https://aquaapp.systems/profile/a&amp;b.example/post/3ok</loc>',
    )
    const index = ensureSitemapIndex(
      `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>https://aquaapp.systems/sitemaps/sections.xml</loc></sitemap>\n</sitemapindex>\n`,
    )
    expect(index).toContain('https://aquaapp.systems/sitemap-posts.xml')
    expect(index).toContain('https://aquaapp.systems/sitemap-profiles.xml')
    expect(ensureSitemapIndex(index)).toBe(index)
  })
})
