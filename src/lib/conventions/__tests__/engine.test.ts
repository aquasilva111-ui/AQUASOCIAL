import {readFileSync} from 'node:fs'
import {join} from 'node:path'

import {
  applyConventionSignals,
  type Convention,
  type ConventionEngine,
  conventionId,
  createConventionEngine,
  createLocalConventionStore,
  createMemorySynthesisRepository,
  decayedActivation,
  neutralRankingSignals,
  parsePersonalGraph,
  type PersonalConventionGraph,
} from '#/lib/conventions'
import {attachConventionEngine} from '#/lib/conventions/bridge'
import {getRelatedMedia} from '#/lib/media/experiences'
import {recordViewEvent} from '#/lib/views/events'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'

const USER = 'did:example:alice'
const START = Date.parse('2026-01-01T00:00:00.000Z')

function iso(offsetMs: number) {
  return new Date(START + offsetMs).toISOString()
}

function engine(
  overrides: Parameters<typeof createConventionEngine>[0] = {},
): ConventionEngine {
  return createConventionEngine({enabled: true, ...overrides})
}

function event(partial: {
  id: string
  eventType: string
  tags?: string[]
  title?: string
  offset?: number
  visibleMs?: number
  watchMs?: number
  sessionId?: string
  creatorDid?: string
  project?: string
  explicit?: boolean
  subjectId?: string
}) {
  return {
    id: partial.id,
    subjectId: partial.subjectId ?? USER,
    eventType: partial.eventType,
    timestamp: iso(partial.offset ?? 0),
    contentUri: 'at://did:example:creator/app.bsky.feed.post/1',
    content: {
      title: partial.title,
      tags: partial.tags,
      creatorDid: partial.creatorDid,
    },
    context: {
      surface: 'social',
      sessionId: partial.sessionId,
      project: partial.project,
    },
    source: partial.explicit ? ('explicit' as const) : ('behavior' as const),
    explicit: partial.explicit,
    visibleMs: partial.visibleMs,
    watchMs: partial.watchMs,
  }
}

function byMeaning(
  graph: PersonalConventionGraph,
  meaning: string,
): Convention | undefined {
  return Object.values(graph.conventions).find(
    convention => convention.canonicalMeaning === meaning,
  )
}

describe('reality convention engine', () => {
  it('turns a content event into conventions without labeling the person', async () => {
    const conventions = engine()
    await conventions.processEvent(
      event({
        id: 'watch',
        eventType: 'watch_time',
        watchMs: 8 * 60 * 1000,
        title: 'Building an open source music production tool',
        tags: ['music', 'open-source', 'software'],
        creatorDid: 'did:example:maker',
      }),
    )
    await conventions.processEvent(
      event({
        id: 'save',
        eventType: 'save',
        title: 'Building an open source music production tool',
        tags: ['music', 'open-source', 'software'],
      }),
    )
    await conventions.processEvent(
      event({
        id: 'return',
        eventType: 'view',
        watchMs: 60_000,
        title: 'Building an open source music production tool',
        tags: ['music', 'open-source', 'software'],
      }),
    )
    await conventions.processEvent(
      event({
        id: 'follow',
        eventType: 'follow',
        title: 'Building an open source music production tool',
        tags: ['music', 'open-source', 'software'],
        creatorDid: 'did:example:maker',
      }),
    )
    const graph = await conventions.getPersonalGraph(USER)
    const meanings = Object.values(graph.conventions).map(
      convention => convention.canonicalMeaning,
    )
    expect(meanings).toEqual(
      expect.arrayContaining([
        'music',
        'music-production',
        'open-source',
        'software',
      ]),
    )
    expect(meanings.join(' ')).not.toMatch(
      /musician|musico|comunist|belief|depress/,
    )
    expect(byMeaning(graph, 'open-source')).toMatchObject({type: 'concept'})
    const music = byMeaning(graph, 'music-production')
    expect(music && 'activation' in music && music.activation).toBeGreaterThan(
      0.4,
    )
    expect(graph.changes.some(change => change.reason === 'evidence')).toBe(
      true,
    )
    const view = await conventions.debugInspect(USER)
    expect(view.conventions.length).toBeGreaterThan(0)
    const explanation = await conventions.explain({
      userDid: USER,
      content: {
        title: 'Building an open source music production tool',
        tags: ['music', 'open-source', 'software'],
      },
      existingRank: 1,
    })
    expect(explanation.rankedBecause.length).toBeGreaterThan(0)
    expect(explanation.note).toMatch(/do not describe who the person is/)
  })

  it('does not duplicate a convention that has the same meaning', async () => {
    const conventions = engine()
    await conventions.processEvent(
      event({id: 'a', eventType: 'save', tags: ['Open Source']}),
    )
    await conventions.processEvent(
      event({
        id: 'b',
        eventType: 'save',
        title: 'software livre/open source',
      }),
    )
    const graph = await conventions.getPersonalGraph(USER)
    const matches = Object.values(graph.conventions).filter(
      convention => convention.canonicalMeaning === 'open-source',
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].evidenceCount).toBe(2)
    expect(matches[0].id).toBe(conventionId('aqua', 'concept', 'open-source'))
  })

  it('raises activation and confidence as evidence repeats', async () => {
    const conventions = engine()
    await conventions.processEvent(
      event({id: '1', eventType: 'save', tags: ['books']}),
    )
    const once = await conventions.getPersonalGraph(USER)
    const first = byMeaning(once, 'books')
    await conventions.processEvent(
      event({id: '2', eventType: 'save', tags: ['books']}),
    )
    await conventions.processEvent(
      event({id: '3', eventType: 'save', tags: ['books']}),
    )
    const again = await conventions.getPersonalGraph(USER)
    const later = byMeaning(again, 'books')
    expect(
      later && 'activation' in later && first && 'activation' in first,
    ).toBe(true)
    if (
      later &&
      first &&
      'activation' in later &&
      'activation' in first &&
      'confidence' in later &&
      'confidence' in first
    ) {
      expect(later.activation).toBeGreaterThan(first.activation)
      expect(later.confidence).toBeGreaterThan(first.confidence)
    }
  })

  it('decays activation without deleting the convention', async () => {
    const conventions = engine({
      decayPolicy: {halfLifeMs: 1000, dormantAfterMs: 5000},
    })
    await conventions.processEvent(
      event({id: 'save', eventType: 'save', tags: ['linux']}),
    )
    const before = await conventions.getPersonalGraph(USER)
    const saved = byMeaning(before, 'linux')
    expect(saved && 'activation' in saved).toBe(true)
    if (!saved || !('activation' in saved)) return
    const decayed = await conventions.decay(USER, iso(1000))
    const after = byMeaning(decayed, 'linux')
    expect(after && 'activation' in after && after.activation).toBeCloseTo(
      decayedActivation(saved.activation, 1000, 1000),
      5,
    )
    expect(after && 'activation' in after && after.activation).toBeLessThan(
      saved.activation,
    )
    expect(
      decayed.conventions[saved && 'id' in saved ? saved.id : ''],
    ).toBeTruthy()
  })

  it('can become dormant and wake up with new evidence', async () => {
    const conventions = engine({
      decayPolicy: {halfLifeMs: 1000, dormantAfterMs: 5000},
    })
    await conventions.processEvent(
      event({id: 'save', eventType: 'save', tags: ['gardening']}),
    )
    const dormant = await conventions.decay(USER, iso(6000))
    const asleep = byMeaning(dormant, 'gardening')
    expect(asleep && 'status' in asleep && asleep.status).toBe('dormant')
    await conventions.processEvent(
      event({
        id: 'again',
        eventType: 'save',
        tags: ['gardening'],
        offset: 7000,
      }),
    )
    const awake = await conventions.getPersonalGraph(USER)
    const restored = byMeaning(awake, 'gardening')
    expect(restored && 'status' in restored && restored.status).toBe('active')
    expect(
      restored &&
        asleep &&
        'activation' in restored &&
        'activation' in asleep &&
        restored.activation,
    ).toBeGreaterThan(asleep && 'activation' in asleep ? asleep.activation : 1)
  })

  it('lets explicit negative feedback beat a weak inference', async () => {
    const conventions = engine()
    await conventions.processEvent(
      event({
        id: 'glance',
        eventType: 'view',
        tags: ['cars'],
        title: 'Sports car review',
        visibleMs: 400,
      }),
    )
    const weak = await conventions.getPersonalGraph(USER)
    const glanced = byMeaning(weak, 'cars')
    expect(
      glanced && 'activation' in glanced && glanced.activation,
    ).toBeLessThan(0.2)
    expect(glanced && 'activation' in glanced && glanced.activation).not.toBe(1)
    await conventions.applyFeedback({
      subjectId: USER,
      kind: 'show_less',
      label: 'cars',
      timestamp: iso(10),
    })
    const corrected = await conventions.getPersonalGraph(USER)
    const dropped = byMeaning(corrected, 'cars')
    expect(
      dropped &&
        glanced &&
        'activation' in dropped &&
        'activation' in glanced &&
        dropped.activation,
    ).toBeLessThan(glanced && 'activation' in glanced ? glanced.activation : 0)
    await conventions.applyFeedback({
      subjectId: USER,
      kind: 'pin',
      label: 'architecture',
      timestamp: iso(20),
    })
    const pinnedGraph = await conventions.getPersonalGraph(USER)
    const pinned = byMeaning(pinnedGraph, 'architecture')
    expect(
      pinned && 'confidence' in pinned && pinned.confidence,
    ).toBeGreaterThanOrEqual(0.95)
    expect(pinned && 'source' in pinned && pinned.source).toBe('explicit')
    expect(
      pinned && glanced && 'confidence' in pinned && 'confidence' in glanced,
    ).toBe(true)
    if (
      pinned &&
      glanced &&
      'confidence' in pinned &&
      'confidence' in glanced
    ) {
      expect(pinned.confidence).toBeGreaterThan(glanced.confidence)
    }
  })

  it('drops identity labels and keeps an ordinary topic', async () => {
    const conventions = engine()
    await conventions.processEvent(
      event({
        id: 'tags',
        eventType: 'save',
        tags: ['depressed user', 'music', 'left-wing user'],
      }),
    )
    const graph = await conventions.getPersonalGraph(USER)
    const meanings = Object.values(graph.conventions).map(
      convention => convention.canonicalMeaning,
    )
    expect(meanings).toContain('music')
    expect(meanings).not.toContain('depressed-user')
    expect(meanings).not.toContain('left-wing-user')
  })

  it('creates a synapse from repeated co-occurrence and not from one event', async () => {
    const alone = engine()
    await alone.processEvent(
      event({
        id: 'once',
        eventType: 'save',
        tags: ['music-theory', 'composition'],
        sessionId: 'session-once',
      }),
    )
    const single = await alone.getPersonalGraph(USER)
    expect(
      Object.values(single.synapses).filter(synapse => synapse.strength > 0),
    ).toHaveLength(0)

    const conventions = engine()
    const repository = createMemorySynthesisRepository()
    const withMemory = engine({synthesisRepository: repository})
    await withMemory.processEvent(
      event({
        id: 'pair-1',
        eventType: 'save',
        tags: ['music-theory', 'composition'],
        sessionId: 'studio',
      }),
    )
    await withMemory.processEvent(
      event({
        id: 'pair-2',
        eventType: 'save',
        tags: ['music-theory', 'composition'],
        sessionId: 'studio',
        offset: 1000,
      }),
    )
    const graph = await withMemory.getPersonalGraph(USER)
    const synapses = Object.values(graph.synapses).filter(
      synapse => synapse.strength > 0,
    )
    expect(synapses.length).toBeGreaterThan(0)
    expect(synapses.every(synapse => synapse.strength < 0.7)).toBe(true)
    const syntheses = await withMemory.synthesize(USER)
    expect(syntheses.length).toBeGreaterThan(0)
    expect(syntheses[0].summary).toBeUndefined()
    expect(syntheses[0].conventionIds.length).toBeGreaterThanOrEqual(2)
    expect(await repository.get(syntheses[0].id)).toMatchObject({
      id: syntheses[0].id,
    })
    expect(conventions).toBeTruthy()
  })

  it('penalizes a saturated topic without erasing personal relevance', async () => {
    const conventions = engine({clock: () => new Date(START + 60_000)})
    for (const id of ['s1', 's2', 's3']) {
      await conventions.processEvent(
        event({id, eventType: 'save', tags: ['ai']}),
      )
    }
    for (let index = 0; index < 12; index++) {
      await conventions.processEvent(
        event({
          id: `seen-${index}`,
          eventType: 'impression',
          tags: ['ai'],
          offset: index,
        }),
      )
    }
    const ranked = await conventions.rankCandidate({
      userDid: USER,
      content: {tags: ['ai'], title: 'A careful essay about AI'},
      existingRank: 1,
    })
    expect(ranked.reason).toBe('ok')
    expect(ranked.signals.personalRelevance).toBeGreaterThan(0.6)
    expect(ranked.signals.saturationPenalty).toBeGreaterThan(0.7)
    const penalized = applyConventionSignals(1, ranked.signals)
    const unpenalized = applyConventionSignals(1, {
      ...ranked.signals,
      saturationPenalty: 0,
    })
    expect(penalized).toBeLessThan(unpenalized)
    expect(ranked.signals.personalRelevance).not.toBe(
      ranked.signals.saturationPenalty,
    )
  })

  it('keeps personal gravity separate from collective gravity', async () => {
    const conventions = engine()
    await conventions.processEvent(
      event({
        id: 'glance',
        eventType: 'view',
        tags: ['topicx'],
        visibleMs: 400,
      }),
    )
    const before = await conventions.getPersonalGraph(USER)
    for (let index = 0; index < 16; index++) {
      await conventions.observeNetwork(
        event({
          id: `net-${index}`,
          eventType: index % 2 === 0 ? 'repost' : 'save',
          tags: ['topicx'],
          subjectId: `did:example:actor${index % 12}`,
          creatorDid: `did:example:creator${index % 5}`,
          offset: index,
        }),
      )
    }
    const personal = await conventions.getPersonalGraph(USER)
    const collective = await conventions.getCollectiveGraph()
    const id = conventionId('aqua', 'topic', 'topicx')
    expect(personal.revision).toBe(before.revision)
    expect(personal.conventions[id].gravity).toBeLessThan(0.35)
    expect(collective.conventions[id].gravity).toBeGreaterThan(0.7)
    expect(personal.conventions[id].gravity).not.toBe(
      collective.conventions[id].gravity,
    )
    const ranked = await conventions.rankCandidate({
      userDid: USER,
      content: {tags: ['topicx']},
      existingRank: 1,
    })
    expect(ranked.signals.collectiveGravity).toBeGreaterThan(
      ranked.signals.personalGravity,
    )
    expect((ranked.adjustedRank ?? 1) - 1).toBeLessThan(0.5)
  })

  it('serializes a graph and a diff', async () => {
    const conventions = engine()
    await conventions.processEvent(
      event({id: '1', eventType: 'save', tags: ['ceramics']}),
    )
    const first = await conventions.getPersonalGraph(USER)
    const snapshot = await conventions.snapshot(USER)
    const restored = parsePersonalGraph(
      JSON.parse(JSON.stringify(snapshot.graph)),
    )
    expect(restored.ok).toBe(true)
    if (restored.ok) {
      expect(restored.value.revision).toBe(first.revision)
      expect(
        restored.value.conventions[conventionId('aqua', 'topic', 'ceramics')]
          .activation,
      ).toBeCloseTo(
        first.conventions[conventionId('aqua', 'topic', 'ceramics')].activation,
      )
    }
    await conventions.processEvent(
      event({id: '2', eventType: 'save', tags: ['ceramics']}),
    )
    const second = await conventions.getPersonalGraph(USER)
    const diff = conventions.diff(first, second)
    expect(diff.schemaVersion).toBe(1)
    expect(diff.toRevision).toBeGreaterThan(diff.fromRevision)
    expect(diff.conventions.some(change => change.kind === 'updated')).toBe(
      true,
    )
  })

  it('rejects a bad schema version and an unknown stored type without throwing', async () => {
    const unknown = parsePersonalGraph({
      schemaVersion: 1,
      subjectId: USER,
      conventions: {
        'aqua:other:custom': {
          id: 'aqua:other:custom',
          canonicalMeaning: 'custom',
          label: 'Custom',
          type: 'etapa-do-metabolismo',
          activation: 0.4,
        },
      },
    })
    expect(unknown.ok).toBe(true)
    if (unknown.ok) {
      expect(unknown.value.conventions['aqua:other:custom'].type).toBe('other')
      expect(
        unknown.value.conventions['aqua:other:custom'].unrecognizedType,
      ).toBe('etapa-do-metabolismo')
    }
    const wrongVersion = parsePersonalGraph({
      schemaVersion: 99,
      subjectId: USER,
      conventions: {},
    })
    expect(wrongVersion.ok).toBe(false)
    if (!wrongVersion.ok) expect(wrongVersion.reason).toBe('schema-version')

    const port = new Map<string, string>()
    port.set(`aqua.convention.graph.${USER}`, '{')
    const store = createLocalConventionStore({
      get: key => port.get(key) ?? null,
      set: (key, value) => {
        port.set(key, value)
      },
    })
    const conventions = engine({store})
    await expect(conventions.getPersonalGraph(USER)).resolves.toMatchObject({
      conventions: {},
    })
    const ranked = await conventions.rankCandidate({
      userDid: USER,
      content: {tags: ['music']},
      existingRank: 5,
    })
    expect(ranked.signals.neutral).toBe(true)
    expect(ranked.adjustedRank).toBe(5)
    expect(conventions.diagnostics().lastError).toBeTruthy()
  })

  it('stays neutral when disabled, and existing events and feed ranking still run', async () => {
    const disabled = createConventionEngine()
    expect(disabled.enabled).toBe(false)
    const processed = await disabled.processEvent(
      event({id: 'off', eventType: 'save', tags: ['music']}),
    )
    expect(processed.applied).toBe(false)
    const graph = await disabled.getPersonalGraph(USER)
    expect(Object.keys(graph.conventions)).toHaveLength(0)
    const ranked = await disabled.rankCandidate({
      userDid: USER,
      content: {tags: ['music']},
      existingRank: 4,
    })
    expect(ranked.signals).toEqual(neutralRankingSignals())
    expect(ranked.adjustedRank).toBe(4)
    expect(applyConventionSignals(4, neutralRankingSignals())).toBe(4)

    const recorded = recordViewEvent({
      contentUri: 'at://did:example:bob/app.bsky.feed.post/1',
      contentType: 'post',
      eventType: 'impression',
      surface: 'social',
    })
    expect(recorded.eventType).toBe('impression')
    expect(recorded.id).toBeTruthy()

    const stop = attachConventionEngine(disabled, () => ({
      title: 'Building an open source music production tool',
      tags: ['music'],
    }))
    recordViewEvent({
      contentUri: 'at://did:example:bob/app.bsky.feed.post/2',
      contentType: 'video',
      eventType: 'click',
      surface: 'view',
      viewerDid: USER,
    })
    stop()
    expect(
      Object.keys((await disabled.getPersonalGraph(USER)).conventions),
    ).toHaveLength(0)

    for (const file of [
      'src/lib/api/feed-manip.ts',
      'src/state/queries/post-feed.ts',
      'src/lib/feed-experience.ts',
      'src/lib/interests.ts',
    ]) {
      expect(
        readFileSync(join(process.cwd(), file), 'utf8').includes(
          'lib/conventions',
        ),
      ).toBe(false)
    }

    const root = image('root', ['Art'])
    const related = image('related', ['art'])
    const unrelated = image('other')
    expect(
      getRelatedMedia(root.post, [root, unrelated, related], 'images').map(
        item => item.uri,
      ),
    ).toEqual(['related', 'other'])
  })

  it('stores context activation separately and can reset inferred state', async () => {
    const conventions = engine()
    await conventions.processEvent(
      event({id: 'work', eventType: 'save', tags: ['ai'], project: 'work'}),
    )
    const graph = await conventions.getPersonalGraph(USER)
    const ai = byMeaning(graph, 'ai')
    expect(
      ai &&
        'activationByContext' in ai &&
        ai.activationByContext['project:work'],
    ).toBeGreaterThan(0)
    expect(
      ai &&
        'activationByContext' in ai &&
        ai.activationByContext['project:entertainment'],
    ).toBeUndefined()
    await conventions.applyFeedback({
      subjectId: USER,
      kind: 'reset_inference',
      timestamp: iso(50),
    })
    const reset = await conventions.getPersonalGraph(USER)
    const cleared = byMeaning(reset, 'ai')
    expect(cleared && 'status' in cleared && cleared.status).toBe('dormant')
    expect(
      cleared && 'activation' in cleared && cleared.activation,
    ).toBeLessThan(0.2)
    expect(reset.evidence.length).toBeGreaterThan(0)
  })
})

function image(uri: string, tags: string[] = []): FeedPostSliceItem {
  const record = {
    $type: 'app.bsky.feed.post',
    text: '',
    createdAt: '2026-01-01T00:00:00Z',
    tags,
  }
  return {
    uri,
    _reactKey: uri,
    record,
    post: {
      uri,
      cid: 'cid',
      author: {did: uri, handle: 'example.test'},
      indexedAt: record.createdAt,
      record,
      embed: {
        $type: 'app.bsky.embed.images#view',
        images: [
          {
            thumb: 'https://example.test/thumb',
            fullsize: 'https://example.test/full',
            alt: '',
          },
        ],
      },
    },
    moderation: {ui: () => ({filter: false})},
  } as unknown as FeedPostSliceItem
}
