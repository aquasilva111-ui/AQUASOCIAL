import {
  type CollectiveConventionGraph,
  type CollectiveConventionNode,
  type Convention,
  CONVENTION_SCHEMA_VERSION,
  CONVENTION_STATUSES,
  CONVENTION_TYPES,
  type ConventionChange,
  type ConventionEvidence,
  type ConventionStatus,
  type ConventionSynapse,
  type ConventionType,
  type EvidencePolarity,
  type EvidenceSource,
  type ExplicitOverride,
  type PersonalConventionGraph,
  type Synthesis,
} from '#/lib/conventions/types'
import {clamp} from '#/lib/numbers'

const MAX_ID = 240
const MAX_LABEL = 120
const MAX_LIST = 32
const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype'])

export type ParseOk<T> = {ok: true; value: T}
export type ParseFail = {ok: false; reason: string}
export type ParseResult<T> = ParseOk<T> | ParseFail

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function safeString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max || trimmed.includes('\0')) return null
  return trimmed
}

function unit(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(value, 0, 1)
}

function count(value: unknown, fallback = 0, max = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(Math.floor(value), 0, max)
}

function mass(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return clamp(value, 0, 1000)
}

function time(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return fallback
  return new Date(parsed).toISOString()
}

function stringList(value: unknown, max = MAX_LIST): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = safeString(item, MAX_LABEL)
    if (!text || out.includes(text)) continue
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

function conventionType(value: unknown): {
  type: ConventionType
  unrecognizedType?: string
} {
  if (
    typeof value === 'string' &&
    (CONVENTION_TYPES as readonly string[]).includes(value)
  ) {
    return {type: value as ConventionType}
  }
  const raw = safeString(value, 80)
  return {type: 'other', unrecognizedType: raw ?? 'invalid'}
}

function status(value: unknown): ConventionStatus {
  if (
    typeof value === 'string' &&
    (CONVENTION_STATUSES as readonly string[]).includes(value)
  ) {
    return value as ConventionStatus
  }
  return 'emerging'
}

function source(value: unknown): EvidenceSource {
  if (
    value === 'content' ||
    value === 'behavior' ||
    value === 'explicit' ||
    value === 'network' ||
    value === 'system'
  )
    return value
  return 'behavior'
}

function override(value: unknown): ExplicitOverride {
  if (
    value === 'pin' ||
    value === 'show_more' ||
    value === 'show_less' ||
    value === 'mute' ||
    value === 'removed'
  )
    return value
  return 'none'
}

function polarity(value: unknown): EvidencePolarity {
  if (value === 'negative' || value === 'explicit_override') return value
  return 'positive'
}

function unitMap(value: unknown): Record<string, number> {
  if (!plain(value)) return {}
  const out: Record<string, number> = {}
  for (const key of Object.keys(value)) {
    if (DANGEROUS.has(key)) continue
    const name = safeString(key, 80)
    if (!name) continue
    out[name] = unit(value[key])
    if (Object.keys(out).length >= MAX_LIST) break
  }
  return out
}

export function emptyPersonalGraph(
  subjectId: string,
  now: string,
): PersonalConventionGraph {
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    subjectId,
    revision: 0,
    conventions: {},
    synapses: {},
    syntheses: {},
    evidence: [],
    seenEvidenceIds: [],
    changes: [],
    exposures: [],
    contexts: [],
    updatedAt: now,
  }
}

export function emptyCollectiveGraph(
  scopeId: string,
  now: string,
): CollectiveConventionGraph {
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    scopeId,
    revision: 0,
    conventions: {},
    updatedAt: now,
  }
}

function parseConvention(
  value: unknown,
  fallbackTime: string,
): Convention | null {
  if (!plain(value)) return null
  const id = safeString(value.id, MAX_ID)
  const canonicalMeaning = safeString(value.canonicalMeaning, 80)
  const label = safeString(value.label, MAX_LABEL)
  if (!id || !canonicalMeaning || !label) return null
  const typed = conventionType(value.type)
  const base = unit(value.activation)
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    id,
    namespace: safeString(value.namespace, 40) ?? 'aqua',
    canonicalMeaning,
    label,
    aliases: stringList(value.aliases),
    type: typed.type,
    unrecognizedType: typed.unrecognizedType,
    confidence: unit(value.confidence),
    activation: base,
    gravity: unit(value.gravity),
    activationByContext: unitMap(value.activationByContext),
    firstSeenAt: time(value.firstSeenAt, fallbackTime),
    lastSeenAt: time(value.lastSeenAt, fallbackTime),
    decayedAt: time(value.decayedAt, time(value.lastSeenAt, fallbackTime)),
    recurrence: count(value.recurrence),
    persistence: unit(value.persistence),
    source: source(value.source),
    evidenceCount: count(value.evidenceCount),
    positiveMass: mass(value.positiveMass),
    negativeMass: mass(value.negativeMass),
    depth: unit(value.depth),
    explicitOverride: override(value.explicitOverride),
    latentActivation:
      typeof value.latentActivation === 'number'
        ? unit(value.latentActivation)
        : undefined,
    contexts: stringList(value.contexts),
    status: status(value.status),
    hasBeenActive: value.hasBeenActive === true,
    removed: value.removed === true,
    version: count(value.version, 1),
  }
}

export function parsePersonalGraph(
  value: unknown,
): ParseResult<PersonalConventionGraph> {
  if (!plain(value)) return {ok: false, reason: 'malformed'}
  if (value.schemaVersion !== CONVENTION_SCHEMA_VERSION) {
    return {ok: false, reason: 'schema-version'}
  }
  const subjectId = safeString(value.subjectId, MAX_ID)
  if (!subjectId) return {ok: false, reason: 'subject'}
  const now = time(value.updatedAt, new Date(0).toISOString())
  const graph = emptyPersonalGraph(subjectId, now)
  graph.revision = count(value.revision)
  if (!plain(value.conventions)) return {ok: false, reason: 'conventions'}
  for (const key of Object.keys(value.conventions)) {
    if (DANGEROUS.has(key)) continue
    const convention = parseConvention(value.conventions[key], now)
    if (!convention || convention.id !== key) continue
    graph.conventions[convention.id] = convention
  }
  if (plain(value.synapses)) {
    for (const key of Object.keys(value.synapses)) {
      if (DANGEROUS.has(key)) continue
      const synapse = parseSynapse(value.synapses[key])
      if (synapse && synapse.id === key) graph.synapses[key] = synapse
    }
  }
  if (plain(value.syntheses)) {
    for (const key of Object.keys(value.syntheses)) {
      if (DANGEROUS.has(key)) continue
      const synthesis = parseSynthesis(value.syntheses[key])
      if (synthesis && synthesis.id === key) graph.syntheses[key] = synthesis
    }
  }
  graph.evidence = Array.isArray(value.evidence)
    ? value.evidence
        .map(item => parseEvidence(item))
        .filter((item): item is ConventionEvidence => item !== null)
        .slice(-200)
    : []
  graph.seenEvidenceIds = stringList(value.seenEvidenceIds, 500)
  graph.changes = Array.isArray(value.changes)
    ? value.changes
        .map(item => parseChange(item))
        .filter((item): item is ConventionChange => item !== null)
        .slice(-100)
    : []
  graph.exposures = []
  if (Array.isArray(value.exposures)) {
    for (const item of value.exposures.slice(-100)) {
      if (!plain(item)) continue
      const at = safeString(item.at, 40)
      if (!at) continue
      graph.exposures.push({
        at: time(at, now),
        conventionIds: stringList(item.conventionIds),
        topicIds: stringList(item.topicIds),
        entityIds: stringList(item.entityIds),
        creatorId: safeString(item.creatorId, MAX_ID) ?? undefined,
        format: safeString(item.format, 40) ?? undefined,
        contentUri: safeString(item.contentUri, 400) ?? undefined,
      })
    }
  }
  graph.contexts = stringList(value.contexts, 64)
  return {ok: true, value: graph}
}

function parseChange(value: unknown): ConventionChange | null {
  if (!plain(value)) return null
  const conventionId = safeString(value.conventionId, MAX_ID)
  const field = safeString(value.field, 40)
  const reason = safeString(value.reason, 80)
  const timestamp = safeString(value.timestamp, 40)
  if (!conventionId || !field || !reason || !timestamp) return null
  const from = value.from
  const to = value.to
  if (typeof from !== 'number' && typeof from !== 'string') return null
  if (typeof to !== 'number' && typeof to !== 'string') return null
  return {
    conventionId,
    field,
    from:
      typeof from === 'number' && Number.isFinite(from)
        ? from
        : String(from).slice(0, 80),
    to:
      typeof to === 'number' && Number.isFinite(to)
        ? to
        : String(to).slice(0, 80),
    source: safeString(value.source, 40) ?? 'system',
    reason,
    timestamp: time(timestamp, new Date(0).toISOString()),
    evidenceIds: stringList(value.evidenceIds, 8),
  }
}

function parseEvidence(value: unknown): ConventionEvidence | null {
  if (!plain(value)) return null
  const id = safeString(value.id, MAX_ID)
  const conventionId = safeString(value.conventionId, MAX_ID)
  const eventType = safeString(value.eventType, 40)
  if (!id || !conventionId || !eventType) return null
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    id,
    conventionId,
    eventId: safeString(value.eventId, MAX_ID) ?? undefined,
    contentUri: safeString(value.contentUri, 400) ?? undefined,
    eventType,
    context: safeString(value.context, 80) ?? '',
    timestamp: time(value.timestamp, new Date(0).toISOString()),
    weight: clamp(
      typeof value.weight === 'number' && Number.isFinite(value.weight)
        ? value.weight
        : 0,
      -1,
      1,
    ),
    confidence: unit(value.confidence),
    source: source(value.source),
    polarity: polarity(value.polarity),
  }
}

function parseSynapse(value: unknown): ConventionSynapse | null {
  if (!plain(value)) return null
  const id = safeString(value.id, MAX_ID)
  const fromConventionId = safeString(value.fromConventionId, MAX_ID)
  const toConventionId = safeString(value.toConventionId, MAX_ID)
  if (!id || !fromConventionId || !toConventionId) return null
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    id,
    fromConventionId,
    toConventionId,
    context: safeString(value.context, 80) ?? undefined,
    strength: unit(value.strength),
    confidence: unit(value.confidence),
    recurrence: count(value.recurrence),
    firstSeenAt: time(value.firstSeenAt, new Date(0).toISOString()),
    lastActivatedAt: time(value.lastActivatedAt, new Date(0).toISOString()),
    version: count(value.version, 1),
  }
}

function parseSynthesis(value: unknown): Synthesis | null {
  if (!plain(value)) return null
  const id = safeString(value.id, MAX_ID)
  if (!id) return null
  const scope =
    value.scope === 'collective' || value.scope === 'reusable'
      ? value.scope
      : 'personal'
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    id,
    subjectId: safeString(value.subjectId, MAX_ID) ?? undefined,
    scope,
    conventionIds: stringList(value.conventionIds, 64),
    synapseIds: stringList(value.synapseIds, 64),
    contexts: stringList(value.contexts),
    confidence: unit(value.confidence),
    summary: safeString(value.summary, 240) ?? undefined,
    createdAt: time(value.createdAt, new Date(0).toISOString()),
    updatedAt: time(value.updatedAt, new Date(0).toISOString()),
    sourceRevision: count(value.sourceRevision),
    version: count(value.version, 1),
  }
}

function parseCollectiveNode(
  value: unknown,
  fallbackId: string,
): CollectiveConventionNode | null {
  if (!plain(value)) return null
  const conventionId = safeString(value.conventionId, MAX_ID) ?? fallbackId
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    conventionId,
    eventVolume: count(value.eventVolume),
    uniqueActorCount: count(value.uniqueActorCount),
    actorIds: stringList(value.actorIds, 500),
    uniqueCreatorCount: count(value.uniqueCreatorCount),
    creatorIds: stringList(value.creatorIds, 200),
    communities: stringList(value.communities),
    reposts: count(value.reposts),
    comments: count(value.comments),
    saves: count(value.saves),
    watchDepth: unit(value.watchDepth),
    persistence: unit(value.persistence),
    gravity: unit(value.gravity),
    firstSeenAt: time(value.firstSeenAt, new Date(0).toISOString()),
    lastSeenAt: time(value.lastSeenAt, new Date(0).toISOString()),
    recentTimestamps: stringList(value.recentTimestamps, 30),
  }
}

export function parseCollectiveGraph(
  value: unknown,
): ParseResult<CollectiveConventionGraph> {
  if (!plain(value)) return {ok: false, reason: 'malformed'}
  if (value.schemaVersion !== CONVENTION_SCHEMA_VERSION)
    return {ok: false, reason: 'schema-version'}
  const scopeId = safeString(value.scopeId, MAX_ID)
  if (!scopeId) return {ok: false, reason: 'scope'}
  const now = time(value.updatedAt, new Date(0).toISOString())
  const graph = emptyCollectiveGraph(scopeId, now)
  graph.revision = count(value.revision)
  if (!plain(value.conventions)) return {ok: false, reason: 'conventions'}
  for (const key of Object.keys(value.conventions)) {
    if (DANGEROUS.has(key)) continue
    const node = parseCollectiveNode(value.conventions[key], key)
    if (!node) continue
    graph.conventions[node.conventionId] = node
  }
  return {ok: true, value: graph}
}
