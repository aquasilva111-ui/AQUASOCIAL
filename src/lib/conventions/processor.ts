import {materializeDecay} from '#/lib/conventions/activation/decay'
import {
  applyWeight,
  blankConvention,
  evidenceRecord,
} from '#/lib/conventions/activation/update'
import {
  type ConventionDebugView,
  inspectConventions,
} from '#/lib/conventions/debug'
import {
  type ViewEventLike,
  viewEventToSemanticEvent,
} from '#/lib/conventions/events/view-adapter'
import {
  type ConventionExplanation,
  explainRanking,
} from '#/lib/conventions/explain/explanation'
import {createRuleBasedExtractor} from '#/lib/conventions/extraction/rule-based'
import {
  type SemanticExtractor,
  type SemanticHit,
} from '#/lib/conventions/extraction/types'
import {stableContextKeys} from '#/lib/conventions/graph/context'
import {diffGraphs, takeSnapshot} from '#/lib/conventions/graph/snapshot'
import {observeCollectiveEvent} from '#/lib/conventions/gravity/collective'
import {personalGravity} from '#/lib/conventions/gravity/personal'
import {
  type ActivationDecayPolicy,
  type CollectiveGravityPolicy,
  type ConfidencePolicy,
  DEFAULT_COLLECTIVE_GRAVITY_POLICY,
  DEFAULT_CONFIDENCE_POLICY,
  DEFAULT_DECAY_POLICY,
  DEFAULT_GRAVITY_POLICY,
  DEFAULT_RANK_BLEND,
  DEFAULT_SATURATION_POLICY,
  DEFAULT_SIGNAL_POLICY,
  DEFAULT_SYNAPSE_POLICY,
  getSignalWeight,
  type GravityPolicy,
  type RankBlendPolicy,
  type SaturationPolicy,
  type SignalPolicy,
  type SynapsePolicy,
} from '#/lib/conventions/policy'
import {adaptRank} from '#/lib/conventions/ranking/adapter'
import {
  type ConventionRankingSignals,
  neutralRankingSignals,
} from '#/lib/conventions/ranking/signals'
import {
  type AliasRule,
  type ConventionRegistry,
  createConventionRegistry,
} from '#/lib/conventions/registry'
import {createMemoryConventionStore} from '#/lib/conventions/storage/memory'
import {type ConventionStore} from '#/lib/conventions/storage/types'
import {
  detectSynapses,
  emptySession,
  type SessionCooccurrence,
  synapseStrengthFor,
} from '#/lib/conventions/synapses/detector'
import {buildSyntheses} from '#/lib/conventions/synthesis/engine'
import {type SynthesisRepository} from '#/lib/conventions/synthesis/repository'
import {withConventionSpan} from '#/lib/conventions/telemetry'
import {
  type CollectiveConventionGraph,
  type ContentSemanticsInput,
  CONVENTION_SCHEMA_VERSION,
  type ConventionChange,
  type ConventionFeedback,
  type ConventionGraphDiff,
  type ConventionGraphSnapshot,
  type PersonalConventionGraph,
  type SemanticEvent,
  type Synthesis,
} from '#/lib/conventions/types'
import {
  emptyCollectiveGraph,
  emptyPersonalGraph,
} from '#/lib/conventions/validate'

const EXPOSURE_EVENTS = new Set([
  'impression',
  'view',
  'unique_view',
  'video_start',
  'video_progress',
  'video_complete',
  'watch_time',
  'play',
  'live_join',
  'live_watch_time',
])

const FEEDBACK_KIND = {
  show_more: 'show_more',
  show_less: 'show_less',
  mute: 'mute',
  unmute: 'unmute',
  pin: 'pin',
  remove: 'remove',
} as const

export type ProcessResult = {
  applied: boolean
  reason?: string
  subjectId?: string
  conventionIds: string[]
  synapseIds: string[]
}

export type RankCandidateInput = {
  userDid: string
  content: ContentSemanticsInput
  context?: SemanticEvent['context']
  existingRank?: number
}

export type RankCandidateResult = {
  signals: ConventionRankingSignals
  adjustedRank?: number
  reason: 'ok' | 'disabled' | 'degraded'
}

export type ConventionEngineOptions = {
  /** Off by default. A disabled engine does not change ranking. */
  enabled?: boolean
  namespace?: string
  store?: ConventionStore
  extractor?: SemanticExtractor
  registry?: ConventionRegistry
  aliases?: AliasRule[]
  contentResolver?: (
    uri: string,
  ) => ContentSemanticsInput | null | Promise<ContentSemanticsInput | null>
  synthesisRepository?: SynthesisRepository
  collectiveScopeId?: string
  clock?: () => Date
  signalPolicy?: Partial<SignalPolicy>
  decayPolicy?: Partial<ActivationDecayPolicy>
  confidencePolicy?: Partial<ConfidencePolicy>
  gravityPolicy?: Partial<GravityPolicy>
  collectiveGravityPolicy?: Partial<CollectiveGravityPolicy>
  synapsePolicy?: Partial<SynapsePolicy>
  saturationPolicy?: Partial<SaturationPolicy>
  rankPolicy?: Partial<RankBlendPolicy>
}

export type ConventionEngine = {
  readonly enabled: boolean
  setEnabled: (enabled: boolean) => void
  processEvent: (event: SemanticEvent | ViewEventLike) => Promise<ProcessResult>
  ingestViewEvent: (
    event: ViewEventLike,
    content?: ContentSemanticsInput,
  ) => Promise<ProcessResult>
  getPersonalGraph: (subjectId: string) => Promise<PersonalConventionGraph>
  getCollectiveGraph: (scopeId?: string) => Promise<CollectiveConventionGraph>
  rankCandidate: (input: RankCandidateInput) => Promise<RankCandidateResult>
  explain: (input: RankCandidateInput) => Promise<ConventionExplanation>
  applyFeedback: (feedback: ConventionFeedback) => Promise<ProcessResult>
  decay: (subjectId: string, now?: string) => Promise<PersonalConventionGraph>
  synthesize: (subjectId: string) => Promise<Synthesis[]>
  observeNetwork: (event: SemanticEvent) => Promise<ProcessResult>
  debugInspect: (subjectId: string) => Promise<ConventionDebugView>
  snapshot: (subjectId: string) => Promise<ConventionGraphSnapshot>
  diff: (
    before: PersonalConventionGraph,
    after: PersonalConventionGraph,
  ) => ConventionGraphDiff
  diagnostics: () => {lastError?: string}
}

function skipped(reason: string, subjectId?: string): ProcessResult {
  return {applied: false, reason, subjectId, conventionIds: [], synapseIds: []}
}

function isSemanticEvent(value: object): value is SemanticEvent {
  return (
    'subjectId' in value &&
    'context' in value &&
    typeof (value as SemanticEvent).subjectId === 'string' &&
    typeof (value as SemanticEvent).context === 'object'
  )
}

export function createConventionEngine(
  options: ConventionEngineOptions = {},
): ConventionEngine {
  let enabled = options.enabled ?? false
  const namespace = options.namespace ?? 'aqua'
  const store = options.store ?? createMemoryConventionStore()
  const clock = options.clock ?? (() => new Date())
  const registry =
    options.registry ?? createConventionRegistry(options.aliases ?? [])
  const extractor =
    options.extractor ?? createRuleBasedExtractor(registry, namespace)
  const signalPolicy = {
    ...DEFAULT_SIGNAL_POLICY,
    ...options.signalPolicy,
    weights: {
      ...DEFAULT_SIGNAL_POLICY.weights,
      ...options.signalPolicy?.weights,
    },
  }
  const decayPolicy = {...DEFAULT_DECAY_POLICY, ...options.decayPolicy}
  const confidencePolicy = {
    ...DEFAULT_CONFIDENCE_POLICY,
    ...options.confidencePolicy,
  }
  const gravityPolicy = {
    ...DEFAULT_GRAVITY_POLICY,
    ...options.gravityPolicy,
    weights: {
      ...DEFAULT_GRAVITY_POLICY.weights,
      ...options.gravityPolicy?.weights,
    },
  }
  const collectivePolicy = {
    ...DEFAULT_COLLECTIVE_GRAVITY_POLICY,
    ...options.collectiveGravityPolicy,
    weights: {
      ...DEFAULT_COLLECTIVE_GRAVITY_POLICY.weights,
      ...options.collectiveGravityPolicy?.weights,
    },
  }
  const synapsePolicy = {...DEFAULT_SYNAPSE_POLICY, ...options.synapsePolicy}
  const saturationPolicy = {
    ...DEFAULT_SATURATION_POLICY,
    ...options.saturationPolicy,
  }
  const rankPolicy = {...DEFAULT_RANK_BLEND, ...options.rankPolicy}
  const scopeId = options.collectiveScopeId ?? 'network'
  const sessions = new Map<string, SessionCooccurrence>()
  const rankCache = new Map<string, RankCandidateResult>()
  let lastError: string | undefined

  function nowIso() {
    return clock().toISOString()
  }

  async function loadPersonal(subjectId: string) {
    try {
      const read = await store.readGraph(subjectId)
      if (!read.ok) {
        lastError = read.reason
        return {graph: emptyPersonalGraph(subjectId, nowIso()), degraded: true}
      }
      lastError = undefined
      return {
        graph: read.graph ?? emptyPersonalGraph(subjectId, nowIso()),
        degraded: false,
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'store-error'
      return {graph: emptyPersonalGraph(subjectId, nowIso()), degraded: true}
    }
  }

  async function loadCollective(id: string) {
    try {
      const read = await store.readCollective(id)
      if (!read.ok) {
        lastError = read.reason
        return {graph: emptyCollectiveGraph(id, nowIso()), degraded: true}
      }
      return {
        graph: read.graph ?? emptyCollectiveGraph(id, nowIso()),
        degraded: false,
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'store-error'
      return {graph: emptyCollectiveGraph(id, nowIso()), degraded: true}
    }
  }

  function rememberChange(
    graph: PersonalConventionGraph,
    change: ConventionChange,
  ) {
    graph.changes.push(change)
    if (graph.changes.length > 100)
      graph.changes.splice(0, graph.changes.length - 100)
  }

  function retouchGravity(graph: PersonalConventionGraph, ids: string[]) {
    for (const id of ids) {
      const convention = graph.conventions[id]
      if (!convention) continue
      convention.gravity = personalGravity(
        {convention, synapseStrength: synapseStrengthFor(id, graph.synapses)},
        gravityPolicy,
      )
    }
  }

  async function resolveContent(event: SemanticEvent) {
    if (event.content) return event.content
    if (!event.contentUri || !options.contentResolver) return undefined
    try {
      return (await options.contentResolver(event.contentUri)) ?? undefined
    } catch {
      return undefined
    }
  }

  async function extractHits(
    event: SemanticEvent,
    content: ContentSemanticsInput | undefined,
  ): Promise<SemanticHit[]> {
    const extracted = await extractor.extract({
      ...content,
      eventType: event.eventType,
    })
    return extracted.hits
  }

  async function applyHits(
    graph: PersonalConventionGraph,
    event: SemanticEvent,
    hits: SemanticHit[],
    weight: number,
    kind?: 'pin' | 'show_more' | 'show_less' | 'mute' | 'unmute' | 'remove',
  ) {
    const contextKeys = stableContextKeys(event.context)
    const ids: string[] = []
    for (const hit of hits) {
      const evidence = evidenceRecord({
        conventionId: hit.id,
        eventId: event.id,
        eventType: event.eventType,
        contentUri: event.contentUri,
        context: contextKeys[0] ?? '',
        timestamp: event.timestamp,
        weight,
        confidence: hit.confidence,
        source: event.explicit ? 'explicit' : event.source,
      })
      if (graph.seenEvidenceIds.includes(evidence.id)) continue
      const before =
        graph.conventions[hit.id] ??
        blankConvention({
          id: hit.id,
          namespace,
          canonicalMeaning: hit.canonicalMeaning,
          label: hit.label,
          aliases: hit.aliases,
          type: hit.type,
          now: event.timestamp,
        })
      for (const alias of hit.aliases) {
        if (!before.aliases.includes(alias)) before.aliases.push(alias)
      }
      const after = applyWeight(before, {
        weight,
        now: event.timestamp,
        source: event.explicit ? 'explicit' : event.source,
        explicit: Boolean(event.explicit),
        contextKeys,
        kind,
        policy: decayPolicy,
        confidencePolicy,
      })
      graph.conventions[hit.id] = after
      graph.evidence.push(evidence)
      graph.seenEvidenceIds.push(evidence.id)
      if (
        Math.abs(before.activation - after.activation) >= 0.001 ||
        before.status !== after.status
      ) {
        rememberChange(graph, {
          conventionId: hit.id,
          field: 'activation',
          from: Number(before.activation.toFixed(4)),
          to: Number(after.activation.toFixed(4)),
          source: event.source,
          reason: event.explicit ? 'explicit-feedback' : 'evidence',
          timestamp: event.timestamp,
          evidenceIds: [evidence.id],
        })
      }
      ids.push(hit.id)
    }
    if (graph.evidence.length > 200)
      graph.evidence.splice(0, graph.evidence.length - 200)
    if (graph.seenEvidenceIds.length > 500) {
      graph.seenEvidenceIds.splice(0, graph.seenEvidenceIds.length - 500)
    }
    for (const key of contextKeys) {
      if (!graph.contexts.includes(key)) graph.contexts.push(key)
    }
    graph.contexts = graph.contexts.slice(-64)
    return ids
  }

  function recordExposure(
    graph: PersonalConventionGraph,
    event: SemanticEvent,
    hits: SemanticHit[],
  ) {
    if (!EXPOSURE_EVENTS.has(event.eventType)) return
    graph.exposures.push({
      at: event.timestamp,
      conventionIds: hits.map(hit => hit.id),
      topicIds: hits.filter(hit => hit.type === 'topic').map(hit => hit.id),
      entityIds: hits.filter(hit => hit.type === 'entity').map(hit => hit.id),
      creatorId: event.content?.creatorDid,
      format: event.content?.contentType ?? event.context.contentType,
      contentUri: event.contentUri,
    })
    const cap = saturationPolicy.exposureCap
    if (graph.exposures.length > cap) {
      graph.exposures.splice(0, graph.exposures.length - cap)
    }
  }

  async function processSemantic(event: SemanticEvent): Promise<ProcessResult> {
    if (!enabled) return skipped('disabled', event.subjectId)
    if (
      event.classification === 'adult_private' ||
      event.content?.classification === 'adult_private'
    ) {
      return skipped('isolated-surface', event.subjectId)
    }
    if (!event.subjectId || !event.eventType || !event.timestamp) {
      return skipped('invalid-event')
    }
    return withConventionSpan(
      'aqua.convention.update',
      {
        'aqua.convention.event_type': event.eventType,
        'aqua.convention.surface': event.context.surface ?? '',
        'aqua.convention.content_type': event.context.contentType ?? '',
        'aqua.convention.enabled': true,
      },
      async () => {
        const loaded = await loadPersonal(event.subjectId)
        if (loaded.degraded) return skipped('degraded', event.subjectId)
        const content = await resolveContent(event)
        const hits = await withConventionSpan(
          'aqua.convention.extract',
          {
            'aqua.convention.event_type': event.eventType,
            'aqua.convention.enabled': true,
          },
          () => extractHits(event, content),
        )
        if (hits.length === 0) return skipped('no-semantics', event.subjectId)
        const weight = getSignalWeight(
          event.eventType,
          {
            watchMs: event.watchMs,
            visibleMs: event.visibleMs,
            progress: event.progress,
          },
          signalPolicy,
        )
        const graph = loaded.graph
        const ids = await applyHits(graph, event, hits, weight)
        if (ids.length === 0) return skipped('duplicate', event.subjectId)
        recordExposure(graph, event, hits)
        let synapseIds: string[] = []
        if (event.context.sessionId) {
          const key = `${event.subjectId}:${event.context.sessionId}`
          const detected = detectSynapses({
            session:
              sessions.get(key) ?? emptySession(Date.parse(event.timestamp)),
            incomingIds: ids,
            nowMs: Date.parse(event.timestamp),
            existing: graph.synapses,
            policy: synapsePolicy,
          })
          sessions.set(key, detected.session)
          graph.synapses = detected.synapses
          synapseIds = detected.touchedIds
          if (synapseIds.length > 0) {
            await withConventionSpan(
              'aqua.convention.synapse',
              {
                'aqua.convention.synapse_count': synapseIds.length,
                'aqua.convention.enabled': true,
              },
              async () => undefined,
            )
          }
        }
        retouchGravity(graph, ids)
        graph.revision += 1
        graph.updatedAt = event.timestamp
        graph.schemaVersion = CONVENTION_SCHEMA_VERSION
        await store.saveGraph(graph)
        rankCache.clear()
        return {
          applied: true,
          subjectId: event.subjectId,
          conventionIds: ids,
          synapseIds,
        }
      },
    ).catch(error => {
      lastError = error instanceof Error ? error.message : 'process-error'
      return skipped('error', event.subjectId)
    })
  }

  async function rank(input: RankCandidateInput): Promise<RankCandidateResult> {
    if (!enabled) {
      return {
        signals: neutralRankingSignals(),
        adjustedRank: input.existingRank,
        reason: 'disabled',
      }
    }
    try {
      const loaded = await loadPersonal(input.userDid)
      const collective = await loadCollective(scopeId)
      if (loaded.degraded || collective.degraded) {
        return {
          signals: neutralRankingSignals(),
          adjustedRank: input.existingRank,
          reason: 'degraded',
        }
      }
      const context = input.context ?? {}
      const cacheKey = [
        input.userDid,
        loaded.graph.revision,
        collective.graph.revision,
        input.content.uri ?? '',
        input.content.title ?? '',
        (input.content.tags ?? []).join(','),
        input.existingRank ?? '',
        stableContextKeys(context).join('|'),
      ].join('§')
      const cached = rankCache.get(cacheKey)
      if (cached) return cached
      const hits = await extractor.extract({
        ...input.content,
        eventType: 'rank',
      })
      const adapted = adaptRank({
        enabled: true,
        existingRank: input.existingRank,
        graph: loaded.graph,
        collective: collective.graph,
        hits: hits.hits,
        contextKeys: stableContextKeys(context),
        now: nowIso(),
        topicIds: hits.topics.map(hit => hit.id),
        entityIds: hits.entities.map(hit => hit.id),
        creatorId: input.content.creatorDid,
        format: input.content.contentType,
        blend: rankPolicy,
      })
      const result: RankCandidateResult = {
        signals: adapted.signals,
        adjustedRank: adapted.adjustedRank,
        reason: 'ok',
      }
      rankCache.set(cacheKey, result)
      if (rankCache.size > 32) {
        const oldest = rankCache.keys().next().value
        if (oldest) rankCache.delete(oldest)
      }
      await withConventionSpan(
        'aqua.convention.rank',
        {
          'aqua.convention.count': hits.hits.length,
          'aqua.convention.enabled': true,
          'aqua.convention.result': 'ok',
        },
        async () => undefined,
      )
      return result
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'rank-error'
      return {
        signals: neutralRankingSignals(),
        adjustedRank: input.existingRank,
        reason: 'degraded',
      }
    }
  }

  return {
    get enabled() {
      return enabled
    },
    setEnabled(value) {
      enabled = value
      rankCache.clear()
    },
    async processEvent(event) {
      if (!event || typeof event !== 'object') return skipped('invalid-event')
      const semantic = isSemanticEvent(event)
        ? event
        : viewEventToSemanticEvent(event, undefined, nowIso())
      if (!semantic) return skipped('anonymous')
      return processSemantic(semantic)
    },
    async ingestViewEvent(event, content) {
      const semantic = viewEventToSemanticEvent(event, content, nowIso())
      if (!semantic) return skipped('anonymous')
      return processSemantic(semantic)
    },
    async getPersonalGraph(subjectId) {
      const loaded = await loadPersonal(subjectId)
      return loaded.graph
    },
    async getCollectiveGraph(id = scopeId) {
      const loaded = await loadCollective(id)
      return loaded.graph
    },
    rankCandidate: rank,
    async explain(input) {
      const ranked = await rank(input)
      const loaded = await loadPersonal(input.userDid)
      const collective = await loadCollective(scopeId)
      const hits = ranked.signals.neutral
        ? []
        : (await extractor.extract({...input.content, eventType: 'rank'})).hits
      const collectiveGravityById: Record<string, number> = {}
      for (const hit of hits) {
        collectiveGravityById[hit.id] =
          collective.graph.conventions[hit.id]?.gravity ?? 0
      }
      return explainRanking({
        graph: loaded.graph,
        hits,
        signals: ranked.signals,
        collectiveGravityById,
        saturation: ranked.signals.saturationPenalty,
        contentUri: input.content.uri,
      })
    },
    async applyFeedback(feedback) {
      if (feedback.kind === 'reset_inference') {
        if (!enabled) return skipped('disabled', feedback.subjectId)
        const loaded = await loadPersonal(feedback.subjectId)
        if (loaded.degraded) return skipped('degraded', feedback.subjectId)
        const graph = loaded.graph
        const when = feedback.timestamp ?? nowIso()
        const resetIds: string[] = []
        for (const convention of Object.values(graph.conventions)) {
          if (convention.source === 'explicit') continue
          const from = convention.activation
          convention.activation = Math.min(convention.activation, 0.05)
          convention.confidence = Math.min(convention.confidence, 0.2)
          convention.status = 'dormant'
          convention.decayedAt = when
          convention.version += 1
          convention.gravity = personalGravity(
            {
              convention,
              synapseStrength: synapseStrengthFor(
                convention.id,
                graph.synapses,
              ),
            },
            gravityPolicy,
          )
          rememberChange(graph, {
            conventionId: convention.id,
            field: 'activation',
            from: Number(from.toFixed(4)),
            to: Number(convention.activation.toFixed(4)),
            source: 'explicit',
            reason: 'reset-inference',
            timestamp: when,
            evidenceIds: [],
          })
          resetIds.push(convention.id)
        }
        graph.revision += 1
        graph.updatedAt = when
        await store.saveGraph(graph)
        rankCache.clear()
        return {
          applied: true,
          subjectId: feedback.subjectId,
          conventionIds: resetIds,
          synapseIds: [],
        }
      }
      const label = feedback.label
      const event: SemanticEvent = {
        id: `feedback:${feedback.subjectId}:${feedback.kind}:${feedback.conventionId ?? label ?? 'all'}:${feedback.timestamp ?? nowIso()}`,
        subjectId: feedback.subjectId,
        eventType: FEEDBACK_KIND[feedback.kind],
        timestamp: feedback.timestamp ?? nowIso(),
        context: feedback.context ?? {},
        source: 'explicit',
        explicit: true,
      }
      if (feedback.conventionId) {
        const loaded = await loadPersonal(feedback.subjectId)
        const existing = loaded.graph.conventions[feedback.conventionId]
        if (!existing) return skipped('unknown-convention', feedback.subjectId)
        event.content = {tags: [existing.label], title: existing.label}
      } else if (label) {
        event.content = {tags: [label]}
      } else return skipped('missing-target', feedback.subjectId)
      const loaded = await loadPersonal(event.subjectId)
      if (!enabled) return skipped('disabled', event.subjectId)
      if (loaded.degraded) return skipped('degraded', event.subjectId)
      const hits = await extractHits(event, event.content)
      const matched = feedback.conventionId
        ? hits.filter(hit => hit.id === feedback.conventionId)
        : hits
      const target = matched.length > 0 ? matched : hits
      if (target.length === 0) return skipped('no-semantics', event.subjectId)
      const weight = getSignalWeight(event.eventType, {}, signalPolicy)
      const ids = await applyHits(
        loaded.graph,
        event,
        target,
        feedback.kind === 'unmute' ? 0 : weight,
        feedback.kind,
      )
      retouchGravity(loaded.graph, ids)
      loaded.graph.revision += 1
      loaded.graph.updatedAt = event.timestamp
      await store.saveGraph(loaded.graph)
      rankCache.clear()
      return {
        applied: true,
        subjectId: event.subjectId,
        conventionIds: ids,
        synapseIds: [],
      }
    },
    async decay(subjectId, now) {
      const when = now ?? nowIso()
      const loaded = await loadPersonal(subjectId)
      if (!enabled || loaded.degraded) return loaded.graph
      for (const [id, convention] of Object.entries(loaded.graph.conventions)) {
        const next = materializeDecay(convention, when, decayPolicy)
        if (
          next.activation !== convention.activation ||
          next.status !== convention.status
        ) {
          rememberChange(loaded.graph, {
            conventionId: id,
            field: 'activation',
            from: Number(convention.activation.toFixed(4)),
            to: Number(next.activation.toFixed(4)),
            source: 'system',
            reason: 'decay',
            timestamp: when,
            evidenceIds: [],
          })
        }
        next.gravity = personalGravity(
          {
            convention: next,
            synapseStrength: synapseStrengthFor(id, loaded.graph.synapses),
          },
          gravityPolicy,
        )
        loaded.graph.conventions[id] = next
      }
      loaded.graph.revision += 1
      loaded.graph.updatedAt = when
      await store.saveGraph(loaded.graph)
      rankCache.clear()
      return loaded.graph
    },
    async synthesize(subjectId) {
      const loaded = await loadPersonal(subjectId)
      if (!enabled || loaded.degraded) return []
      const when = nowIso()
      const syntheses = await withConventionSpan(
        'aqua.convention.synthesis',
        {'aqua.convention.enabled': true, 'aqua.convention.count': 0},
        async () => buildSyntheses(loaded.graph, when),
      )
      loaded.graph.syntheses = {}
      for (const synthesis of syntheses) {
        loaded.graph.syntheses[synthesis.id] = synthesis
        await options.synthesisRepository?.put(synthesis)
      }
      loaded.graph.revision += 1
      loaded.graph.updatedAt = when
      await store.saveGraph(loaded.graph)
      return syntheses
    },
    async observeNetwork(event) {
      if (!enabled) return skipped('disabled', event.subjectId)
      if (event.classification === 'adult_private')
        return skipped('isolated-surface', event.subjectId)
      const hits = await extractHits(event, event.content)
      if (hits.length === 0) return skipped('no-semantics', event.subjectId)
      const loaded = await loadCollective(scopeId)
      if (loaded.degraded) return skipped('degraded', event.subjectId)
      const next = observeCollectiveEvent(
        loaded.graph,
        {
          scopeId,
          conventionIds: hits.map(hit => hit.id),
          actorId: event.subjectId,
          creatorId: event.content?.creatorDid,
          community: event.context.community,
          eventType: event.eventType,
          timestamp: event.timestamp,
          watchRatio: event.progress,
        },
        collectivePolicy,
      )
      await store.saveCollective(next)
      rankCache.clear()
      return {
        applied: true,
        subjectId: event.subjectId,
        conventionIds: hits.map(hit => hit.id),
        synapseIds: [],
      }
    },
    async debugInspect(subjectId) {
      const graph = await this.getPersonalGraph(subjectId)
      return inspectConventions(graph)
    },
    async snapshot(subjectId) {
      const graph = await this.getPersonalGraph(subjectId)
      return takeSnapshot(graph, nowIso())
    },
    diff(before, after) {
      return diffGraphs(before, after)
    },
    diagnostics() {
      return {lastError}
    },
  }
}
