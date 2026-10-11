import {describe, expect, it} from 'vitest'

import {type Candidate, engagement, hotScore, rankHot} from '../src/score.ts'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const hoursAgo = (h: number) => NOW - h * 3_600_000
const post = (over: Partial<Candidate> = {}): Candidate => ({
  uri: 'at://did:a/app.bsky.feed.post/1',
  author: 'did:a',
  indexedAt: hoursAgo(1),
  likes: 0,
  reposts: 0,
  replies: 0,
  ...over,
})

describe('hotScore', () => {
  it('pesa likes 1, reposts 2, respostas 3', () => {
    expect(engagement({likes: 1, reposts: 1, replies: 1})).toBe(6)
  })

  it('segue (likes + 2·reposts + 3·replies) / (horas + 2)^1.5', () => {
    const c = post({likes: 10, reposts: 5, replies: 2, indexedAt: hoursAgo(2)})
    expect(hotScore(c, NOW)).toBeCloseTo(26 / Math.pow(4, 1.5))
  })

  it('cai com a idade e nunca divide por zero', () => {
    const fresh = hotScore(post({likes: 5, indexedAt: NOW}), NOW)
    const old = hotScore(post({likes: 5, indexedAt: hoursAgo(48)}), NOW)
    expect(fresh).toBeCloseTo(5 / Math.pow(2, 1.5))
    expect(old).toBeLessThan(fresh)
  })

  it('não premia relógio no futuro (idade mínima 0)', () => {
    const future = hotScore(post({likes: 5, indexedAt: NOW + 3_600_000}), NOW)
    expect(future).toBeCloseTo(5 / Math.pow(2, 1.5))
  })
})

describe('rankHot', () => {
  it('ordena por pontuação', () => {
    const out = rankHot(
      [
        post({uri: 'a', likes: 1}),
        post({uri: 'b', author: 'did:b', likes: 9}),
        post({uri: 'c', author: 'did:c', replies: 2}),
      ],
      NOW,
    )
    expect(out.map(r => r.uri)).toEqual(['b', 'c', 'a'])
  })

  it('post muito curtido de ontem perde para post bom de agora', () => {
    const out = rankHot(
      [
        post({uri: 'ontem', likes: 100, indexedAt: hoursAgo(30)}),
        post({
          uri: 'agora',
          author: 'did:b',
          likes: 12,
          indexedAt: hoursAgo(0.5),
        }),
      ],
      NOW,
    )
    expect(out[0]!.uri).toBe('agora')
  })

  it('limita posts por autor', () => {
    const many = Array.from({length: 6}, (_, i) =>
      post({uri: `a${i}`, likes: 50 - i}),
    )
    const out = rankHot(
      [...many, post({uri: 'b', author: 'did:b', likes: 1})],
      NOW,
      {maxPerAuthor: 2},
    )
    expect(out.map(r => r.uri)).toEqual(['a0', 'a1', 'b'])
  })

  it('ignora quem não atingiu o engajamento mínimo e respeita o limite', () => {
    const items = [
      post({uri: 'zero'}),
      ...Array.from({length: 5}, (_, i) =>
        post({uri: `p${i}`, author: `did:${i}`, likes: 2}),
      ),
    ]
    expect(
      rankHot(items, NOW, {minEngagement: 1}).map(r => r.uri),
    ).not.toContain('zero')
    expect(rankHot(items, NOW, {limit: 3})).toHaveLength(3)
  })

  it('é determinístico em empates', () => {
    const items = [
      post({uri: 'b', author: 'did:b', likes: 3}),
      post({uri: 'a', likes: 3}),
    ]
    expect(rankHot(items, NOW).map(r => r.uri)).toEqual(['a', 'b'])
    expect(rankHot([...items].reverse(), NOW).map(r => r.uri)).toEqual([
      'a',
      'b',
    ])
  })
})
