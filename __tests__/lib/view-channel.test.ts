import {
  channelAccess,
  channelPath,
  defaultSections,
  latestFirst,
  moveItem,
  newChannelRecord,
  normalizeChannel,
  popularFirst,
  safeUrl,
  toWritableRecord,
  VIEW_CHANNEL_COLLECTION,
} from '#/lib/view-channel/model'
import {router} from '#/routes'

const OWNER = 'did:plc:owner000000000000000000'
const OTHER = 'did:plc:other000000000000000000'
const post = (did: string, rkey: string) =>
  `at://${did}/app.bsky.feed.post/${rkey}`

describe('channel record (AQUA-019A)', () => {
  it('a new channel is active, public, with a default Home layout', () => {
    const r = newChannelRecord({}, new Date('2026-09-30T00:00:00Z'))
    expect(r).toMatchObject({
      $type: VIEW_CHANNEL_COLLECTION,
      status: 'active',
      visibility: 'public',
      links: [],
    })
    expect(r.sections.map(s => s.type)).toEqual([
      'latest',
      'popular',
      'live',
      'videos',
    ])
    // No identity fields: avatar, handle, auth all stay on the AQUA Profile.
    for (const key of ['did', 'handle', 'avatar', 'password', 'email'])
      expect(r).not.toHaveProperty(key)
  })

  it('normalizes untrusted repo data and keeps only safe values', () => {
    const r = normalizeChannel(
      {
        displayNameOverride: '  Canal  ',
        description: 'x'.repeat(5000),
        status: 'suspended',
        visibility: 'weird',
        defaultLanguage: 'klingon',
        topics: ['música', '', 42, 'games'],
        bannerFocusY: 250,
        banner: {
          $type: 'blob',
          ref: {$link: 'bafy'},
          mimeType: 'text/html',
          size: 1,
        },
        trailerUri: post(OTHER, 'abc'),
        featuredUri: post(OWNER, 'def'),
        links: [
          {id: 'a', label: 'Site', url: 'example.com', position: 1},
          {id: 'b', label: 'Evil', url: 'javascript:alert(1)', position: 0},
          {id: 'c', label: '', url: 'https://x.com', position: 2},
        ],
        sections: [
          {id: 's1', type: 'popular', position: 5, visibility: 'visible'},
          {id: 's2', type: 'not-a-type', position: 0},
          {id: 's3', type: 'latest', position: 1, visibility: 'hidden'},
        ],
      },
      OWNER,
    )!
    expect(r.displayNameOverride).toBe('Canal')
    expect(r.description).toHaveLength(1000)
    // "suspended" is never self-declared: only AQUA moderation decides it.
    expect(r.status).toBe('active')
    expect(r.visibility).toBe('public')
    expect(r.defaultLanguage).toBeUndefined()
    expect(r.topics).toEqual(['música', 'games'])
    expect(r.bannerFocusY).toBe(100)
    expect(r.banner).toBeUndefined()
    // References must point at the owner's own posts.
    expect(r.trailerUri).toBeUndefined()
    expect(r.featuredUri).toBe(post(OWNER, 'def'))
    expect(r.links).toEqual([
      {id: 'a', label: 'Site', url: 'https://example.com/', position: 1},
    ])
    expect(r.sections.map(s => [s.id, s.position, s.visibility])).toEqual([
      ['s3', 0, 'hidden'],
      ['s1', 1, 'visible'],
    ])
  })

  it('missing record = no channel', () => {
    expect(normalizeChannel(undefined, OWNER)).toBeUndefined()
  })

  it('only http(s) links with a real host', () => {
    expect(safeUrl('https://aquaapp.systems/x')).toBe(
      'https://aquaapp.systems/x',
    )
    expect(safeUrl('instagram.com/aqua')).toBe('https://instagram.com/aqua')
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://a.b',
      'localhost',
      '',
    ])
      expect(safeUrl(bad)).toBeUndefined()
  })

  it('routes: create page wins over a handle; handles map to the channel page', () => {
    expect(router.matchPath('/views/channel/new')[0]).toBe('ViewChannelCreate')
    expect(router.matchPath('/views/channel/alice.bsky.social')).toEqual([
      'ViewChannel',
      {handle: 'alice.bsky.social'},
    ])
    expect(router.matchPath('/views/studio')[0]).toBe('ViewStudio')
    expect(router.matchPath('/views/studio/customization')[0]).toBe(
      'ViewStudioCustomize',
    )
    expect(channelPath('alice.bsky.social')).toBe(
      '/views/channel/alice.bsky.social',
    )
    // Links shared before the /videos → /views move still open the channel.
    expect(router.matchPath('/videos/channel/alice.bsky.social')).toEqual([
      'ViewChannelLegacy',
      {handle: 'alice.bsky.social'},
    ])
    expect(router.matchPath('/videos')[0]).toBe('VideosLegacy')
  })
})

describe('owner vs visitor', () => {
  const channel = newChannelRecord()
  it('visitors see active public channels only', () => {
    expect(channelAccess({channel, isOwner: false, moderated: false})).toEqual({
      state: 'visible',
      status: 'active',
    })
    for (const patch of [{status: 'draft'}, {visibility: 'private'}] as const)
      expect(
        channelAccess({
          channel: {...channel, ...patch},
          isOwner: false,
          moderated: false,
        }),
      ).toEqual({state: 'unavailable'})
  })
  it('the owner sees drafts and private channels', () => {
    expect(
      channelAccess({
        channel: {...channel, status: 'draft'},
        isOwner: true,
        moderated: false,
      }),
    ).toEqual({state: 'visible', status: 'draft'})
  })
  it('AQUA moderation suspends the channel for everyone', () => {
    expect(channelAccess({channel, isOwner: true, moderated: true})).toEqual({
      state: 'suspended',
    })
  })
  it('no record → no channel', () => {
    expect(
      channelAccess({channel: undefined, isOwner: false, moderated: false}),
    ).toEqual({
      state: 'none',
    })
  })
})

describe('customization (AQUA-019C)', () => {
  it('reorders sections and links with contiguous positions', () => {
    const sections = defaultSections()
    const down = moveItem(sections, 0, 1)
    expect(down.map(s => s.type)).toEqual([
      'popular',
      'latest',
      'live',
      'videos',
    ])
    expect(down.map(s => s.position)).toEqual([0, 1, 2, 3])
    expect(moveItem(sections, 0, -1).map(s => s.type)).toEqual(
      sections.map(s => s.type),
    )
  })

  it('popular and latest orderings', () => {
    const v = [
      {uri: 'a', indexedAt: '2026-01-01', likeCount: 1},
      {uri: 'b', indexedAt: '2026-03-01', likeCount: 0},
      {uri: 'c', indexedAt: '2026-02-01', likeCount: 3, repostCount: 2},
    ]
    expect(latestFirst(v).map(x => x.uri)).toEqual(['b', 'c', 'a'])
    expect(popularFirst(v).map(x => x.uri)).toEqual(['c', 'a', 'b'])
  })

  it('a written record drops empty fields and stamps updatedAt', () => {
    const created = newChannelRecord({}, new Date('2026-01-01T00:00:00Z'))
    const out = toWritableRecord(
      {...created, description: '', trailerUri: undefined},
      new Date('2026-02-01T00:00:00Z'),
    )
    expect(out).not.toHaveProperty('description')
    expect(out).not.toHaveProperty('trailerUri')
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(out.updatedAt).toBe('2026-02-01T00:00:00.000Z')
  })
})
