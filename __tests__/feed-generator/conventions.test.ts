/**
 * @jest-environment node
 */
import {
  EMPTY_PROFILE,
  scoreCandidate,
} from '../../feed-generator/src/algos/for-you/score'
import {
  contextOf,
  conventionKeys,
  normalizeTag,
  tagsFromRecord,
} from '../../feed-generator/src/conventions/extract'
import {
  decayFactor,
  GRAVITY,
  gravity,
  type GravityDims,
  stateOf,
} from '../../feed-generator/src/conventions/gravity'
import {
  canonical,
  conventionId,
  versionHash,
} from '../../feed-generator/src/conventions/model'
import {synapsesFromEvents} from '../../feed-generator/src/conventions/synapse'

const dims = (o: Partial<GravityDims> = {}): GravityDims => ({
  intensity: 0,
  frequency: 0,
  persistence: 0,
  diversity: 0,
  connectivity: 0,
  recencyDays: 0,
  ...o,
})

describe('extract', () => {
  it('normalises tags and reads hashtag facets', () => {
    expect(normalizeTag('#Música')).toBe('musica')
    const tags = tagsFromRecord({
      tags: ['Jogos'],
      facets: [
        {features: [{$type: 'app.bsky.richtext.facet#tag', tag: 'Arte'}]},
      ],
    })
    expect(tags).toEqual(['jogos', 'arte'])
  })

  it('lets one post activate several Conventions', () => {
    const keys = conventionKeys({
      author: 'did:a',
      mediaType: 'video',
      tags: ['musica'],
      lang: 'pt-BR',
    })
    expect(keys).toEqual([
      'formato:video',
      'criador:did:a',
      'tema:musica',
      'idioma:pt',
    ])
  })

  it('buckets context by hour', () => {
    expect(contextOf('2026-09-30T02:00:00Z')).toBe('madrugada')
    expect(contextOf('2026-09-30T21:00:00Z')).toBe('noite')
  })
})

describe('identity and versioning', () => {
  it('gives the same id to the same key, independent of anyone', () => {
    expect(conventionId('tema:musica')).toBe(conventionId('tema:musica'))
    expect(conventionId('tema:musica')).not.toBe(conventionId('tema:arte'))
  })

  it('chains versions by hash', () => {
    const v1 = versionHash('tema:x', 1, 'emerging', null)
    const v2 = versionHash('tema:x', 2, 'active', v1)
    expect(v2).not.toBe(v1)
    expect(versionHash('tema:x', 2, 'active', v1)).toBe(v2)
  })

  it('serialises canonically regardless of key order', () => {
    expect(canonical({b: 1, a: [2, {d: 1, c: 2}]})).toBe(
      canonical({a: [2, {c: 2, d: 1}], b: 1}),
    )
  })
})

describe('gravity', () => {
  it('grows with persistence, diversity and connectivity', () => {
    const base = dims({intensity: 5, frequency: 5, persistence: 1})
    const rich = dims({
      intensity: 5,
      frequency: 5,
      persistence: 6,
      diversity: 3,
      connectivity: 4,
    })
    expect(gravity(rich)).toBeGreaterThan(gravity(base))
  })

  it('halves after one half-life', () => {
    expect(decayFactor(GRAVITY.halfLifeDays)).toBeCloseTo(0.5)
  })

  it('moves through emerging, active, weakening and dormant', () => {
    expect(stateOf(dims({intensity: 1, frequency: 2, recencyDays: 1}))).toBe(
      'emerging',
    )
    expect(
      stateOf(
        dims({intensity: 30, frequency: 40, persistence: 8, recencyDays: 1}),
      ),
    ).toBe('active')
    expect(stateOf(dims({intensity: 30, frequency: 40, recencyDays: 20}))).toBe(
      'weakening',
    )
    expect(stateOf(dims({intensity: 30, frequency: 40, recencyDays: 60}))).toBe(
      'dormant',
    )
  })
})

describe('synapses', () => {
  const ev = (t: string, weight: number, keys: string[]) => ({
    createdAt: `2026-09-30T${t}:00Z`,
    weight,
    keys,
  })

  it('relates Conventions that co-occur inside one session, per context', () => {
    const obs = synapsesFromEvents([
      ev('22:00', 2, ['tema:musica', 'formato:video']),
      ev('22:10', 3, ['tema:musica']),
    ])
    expect(obs).toEqual([
      {
        a: 'formato:video',
        b: 'tema:musica',
        context: 'noite',
        at: '2026-09-30T22:10:00Z',
      },
    ])
  })

  it('does not relate across sessions or from negative signals', () => {
    expect(
      synapsesFromEvents([
        ev('08:00', 2, ['tema:a']),
        ev('20:00', 2, ['tema:b']),
      ]),
    ).toEqual([])
    expect(synapsesFromEvents([ev('08:00', -4, ['tema:a', 'tema:b'])])).toEqual(
      [],
    )
  })
})

describe('feed integration', () => {
  it('boosts a post whose Conventions have personal gravity', () => {
    const now = Date.parse('2026-09-30T12:00:00Z')
    const post = {
      uri: 'u',
      author: 'did:a',
      indexedAt: '2026-09-30T11:00:00Z',
      mediaType: 'text' as const,
      conventionKeys: ['tema:musica'],
      likeCount: 1,
      repostCount: 0,
      replyCount: 0,
    }
    const plain = scoreCandidate(post, EMPTY_PROFILE, now)
    const boosted = scoreCandidate(
      post,
      {...EMPTY_PROFILE, conventionGravity: new Map([['tema:musica', 3]])},
      now,
    )
    expect(boosted).toBeGreaterThan(plain)
  })
})
