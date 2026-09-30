import {
  type Candidate,
  diversify,
  EMPTY_PROFILE,
  rank,
  scoreCandidate,
  type ViewerProfile,
} from '../../feed-generator/src/algos/for-you/score'

const NOW = Date.parse('2026-09-30T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

const post = (over: Partial<Candidate> = {}): Candidate => ({
  uri: 'at://did:a/app.bsky.feed.post/1',
  author: 'did:a',
  indexedAt: hoursAgo(1),
  mediaType: 'text',
  likeCount: 0,
  repostCount: 0,
  replyCount: 0,
  ...over,
})

const profile = (over: Partial<ViewerProfile> = {}): ViewerProfile => ({
  authorAffinity: new Map(),
  mediaAffinity: new Map(),
  seen: new Set(),
  lessPosts: new Set(),
  ...over,
})

describe('for-you score', () => {
  it('ranks engagement above none at the same age', () => {
    const hot = post({uri: 'hot', likeCount: 20, repostCount: 5})
    const cold = post({uri: 'cold'})
    expect(rank([cold, hot], EMPTY_PROFILE, NOW)[0].uri).toBe('hot')
  })

  it('decays with age', () => {
    const fresh = post({uri: 'fresh', likeCount: 5, indexedAt: hoursAgo(1)})
    const old = post({uri: 'old', likeCount: 5, indexedAt: hoursAgo(40)})
    expect(rank([old, fresh], EMPTY_PROFILE, NOW)[0].uri).toBe('fresh')
  })

  it('boosts authors the viewer interacts with', () => {
    const a = post({uri: 'a', author: 'did:a', likeCount: 3})
    const b = post({uri: 'b', author: 'did:b', likeCount: 3})
    const p = profile({authorAffinity: new Map([['did:b', 12]])})
    expect(rank([a, b], p, NOW)[0].uri).toBe('b')
  })

  it('demotes seen and requestLess posts without removing them', () => {
    const c = post({uri: 'x', likeCount: 10})
    const base = scoreCandidate(c, EMPTY_PROFILE, NOW)
    expect(
      scoreCandidate(c, profile({seen: new Set(['x'])}), NOW),
    ).toBeLessThan(base)
    expect(
      scoreCandidate(c, profile({lessPosts: new Set(['x'])}), NOW),
    ).toBeGreaterThan(0)
  })

  it('favours the viewer preferred media type', () => {
    const t = post({uri: 't', mediaType: 'text', likeCount: 3})
    const v = post({uri: 'v', mediaType: 'video', likeCount: 3})
    const p = profile({mediaAffinity: new Map([['video', 10]])})
    expect(rank([t, v], p, NOW)[0].uri).toBe('v')
  })

  it('spreads an author across the list', () => {
    const items = [
      {author: 'a', id: 1},
      {author: 'a', id: 2},
      {author: 'a', id: 3},
      {author: 'b', id: 4},
      {author: 'c', id: 5},
    ]
    const out = diversify(items).map(i => i.id)
    expect(out.slice(0, 3)).toEqual([1, 4, 5])
    expect(out).toHaveLength(5)
  })
})
