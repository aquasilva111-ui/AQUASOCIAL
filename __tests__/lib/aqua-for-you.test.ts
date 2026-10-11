import {describe, expect, it} from '@jest/globals'

import {
  isForYouFeed,
  normalizeConventionName,
  parseForYouContext,
  shares,
  sparkline,
  trendDirection,
} from '../../src/lib/aqua-for-you'

// Same shape aqua-feeds writes in feedContextOf() (algos/for-you/score.ts)
const CTX = JSON.stringify({
  v: 1,
  a: 'pra-voce',
  s: 2.5,
  f: 0.85,
  h: 0.4,
  c: [
    ['tema:arte', 'tag', 1.6],
    ['tema:aquarela', 'sinapse', 0.3, 'tema:arte'],
    ['idioma:pt', 'idioma', 0.2],
    ['x', 'inventado', 9],
  ],
  p: ['visto', 'outra'],
})

describe('aqua "Pra você" feedContext', () => {
  it('parses the parts, the synapse bridge and penalties', () => {
    const ctx = parseForYouContext(CTX)!
    expect(ctx.score).toBe(2.5)
    expect(ctx.parts.map(p => p.key)).toEqual([
      'tema:arte',
      'tema:aquarela',
      'idioma:pt',
    ])
    expect(ctx.parts[1]).toMatchObject({
      tipo: 'tema',
      nome: 'aquarela',
      via: 'sinapse',
      through: 'tema:arte',
    })
    expect(ctx.penalties).toEqual(['visto'])
    expect(shares(ctx)[0]!.share).toBeCloseTo(0.64)
  })

  it('ignores other feeds and garbage', () => {
    expect(parseForYouContext(undefined)).toBeUndefined()
    expect(parseForYouContext('nope')).toBeUndefined()
    expect(parseForYouContext('{"a":"em-alta","v":1}')).toBeUndefined()
    expect(parseForYouContext('x'.repeat(2001))).toBeUndefined()
  })

  it('matches only the configured feed', () => {
    const uri = 'at://did:plc:aqua/app.bsky.feed.generator/pra-voce'
    expect(isForYouFeed(`feedgen|${uri}`, uri)).toBe(true)
    expect(isForYouFeed('following', uri)).toBe(false)
    expect(isForYouFeed(`feedgen|${uri}`, '')).toBe(false)
  })

  it('trend helpers and name normalization', () => {
    expect(sparkline([1, 2, 4])).toEqual([0.25, 0.5, 1])
    expect(sparkline([0, 0])).toEqual([0, 0])
    expect(trendDirection([2, 3])).toBe('up')
    expect(trendDirection([3, 1])).toBe('down')
    expect(trendDirection([3])).toBe('flat')
    expect(normalizeConventionName('  #Aquarela Viva ')).toBe('aquarela-viva')
  })
})
