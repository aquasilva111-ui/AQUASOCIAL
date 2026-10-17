/**
 * Reality Conventions — persisted schema v1.
 *
 * A Convention is the meaning of content or context. It is not a psychological
 * label, not an AT Protocol profile, and not an onboarding interest.
 */

export const CONVENTION_SCHEMA_VERSION = 1

export const CONVENTION_TYPES = [
  'topic',
  'entity',
  'concept',
  'activity',
  'format',
  'creator',
  'community',
  'context',
  'value',
  'other',
] as const

export type ConventionType = (typeof CONVENTION_TYPES)[number]

/**
 * Reserved names for a later consent-gated phase.
 * Extractors must not emit them. Stored values are coerced to `other`.
 */
export const FUTURE_SENSITIVE_TYPES = [
  'belief',
  'symbol',
  'wound',
  'fear',
  'hope',
] as const

export type FutureSensitiveType = (typeof FUTURE_SENSITIVE_TYPES)[number]

export const CONVENTION_STATUSES = [
  'emerging',
  'active',
  'weakening',
  'dormant',
] as const

export type ConventionStatus = (typeof CONVENTION_STATUSES)[number]

export type EvidencePolarity = 'positive' | 'negative' | 'explicit_override'

export type EvidenceSource =
  | 'content'
  | 'behavior'
  | 'explicit'
  | 'network'
  | 'system'

export type ExplicitOverride =
  | 'none'
  | 'pin'
  | 'show_more'
  | 'show_less'
  | 'mute'
  | 'removed'

export type ConventionContext = {
  surface?: string
  sessionId?: string
  project?: string
  community?: string
  creator?: string
  contentType?: string
  timeWindow?: string
}

export type Convention = {
  schemaVersion: number
  id: string
  namespace: string
  canonicalMeaning: string
  label: string
  aliases: string[]
  type: ConventionType
  /** Set when a stored record used a type this version does not understand. */
  unrecognizedType?: string
  confidence: number
  activation: number
  gravity: number
  /** Activation of the same convention inside a stable context key. */
  activationByContext: Record<string, number>
  firstSeenAt: string
  lastSeenAt: string
  /** When `activation` was last materialized. Decay is applied from here. */
  decayedAt: string
  recurrence: number
  persistence: number
  source: EvidenceSource
  evidenceCount: number
  positiveMass: number
  negativeMass: number
  depth: number
  explicitOverride: ExplicitOverride
  /** Activation kept while muted, so unmute does not invent a new history. */
  latentActivation?: number
  contexts: string[]
  status: ConventionStatus
  hasBeenActive: boolean
  removed: boolean
  version: number
}

export type ConventionEvidence = {
  schemaVersion: number
  id: string
  conventionId: string
  eventId?: string
  contentUri?: string
  eventType: string
  context: string
  timestamp: string
  weight: number
  confidence: number
  source: EvidenceSource
  polarity: EvidencePolarity
}

export type ConventionChange = {
  conventionId: string
  field: string
  from: number | string
  to: number | string
  source: string
  reason: string
  timestamp: string
  evidenceIds: string[]
}

export type ExposureRecord = {
  at: string
  conventionIds: string[]
  topicIds: string[]
  entityIds: string[]
  creatorId?: string
  format?: string
  contentUri?: string
}

export type ConventionSynapse = {
  schemaVersion: number
  id: string
  fromConventionId: string
  toConventionId: string
  context?: string
  strength: number
  confidence: number
  recurrence: number
  firstSeenAt: string
  lastActivatedAt: string
  version: number
}

export type Synthesis = {
  schemaVersion: number
  id: string
  subjectId?: string
  scope: 'personal' | 'collective' | 'reusable'
  conventionIds: string[]
  synapseIds: string[]
  contexts: string[]
  confidence: number
  /** Computational syntheses do not require generated text. */
  summary?: string
  createdAt: string
  updatedAt: string
  sourceRevision: number
  version: number
}

export type PersonalConventionGraph = {
  schemaVersion: number
  subjectId: string
  revision: number
  conventions: Record<string, Convention>
  synapses: Record<string, ConventionSynapse>
  syntheses: Record<string, Synthesis>
  evidence: ConventionEvidence[]
  seenEvidenceIds: string[]
  changes: ConventionChange[]
  exposures: ExposureRecord[]
  contexts: string[]
  updatedAt: string
}

export type CollectiveConventionNode = {
  schemaVersion: number
  conventionId: string
  eventVolume: number
  uniqueActorCount: number
  actorIds: string[]
  uniqueCreatorCount: number
  creatorIds: string[]
  communities: string[]
  reposts: number
  comments: number
  saves: number
  watchDepth: number
  persistence: number
  gravity: number
  firstSeenAt: string
  lastSeenAt: string
  recentTimestamps: string[]
}

export type CollectiveConventionGraph = {
  schemaVersion: number
  scopeId: string
  revision: number
  conventions: Record<string, CollectiveConventionNode>
  updatedAt: string
}

export type ConventionGraphSnapshot = {
  schemaVersion: number
  subjectId: string
  revision: number
  takenAt: string
  graph: PersonalConventionGraph
}

export type ConventionGraphDiff = {
  schemaVersion: number
  subjectId: string
  fromRevision: number
  toRevision: number
  conventions: Array<{
    id: string
    kind: 'added' | 'removed' | 'updated'
    fields: string[]
  }>
  synapses: Array<{id: string; kind: 'added' | 'removed' | 'updated'}>
  syntheses: Array<{id: string; kind: 'added' | 'removed' | 'updated'}>
}

export type ContentSemanticsInput = {
  uri?: string
  title?: string
  description?: string
  text?: string
  tags?: string[]
  hashtags?: string[]
  categories?: string[]
  contentType?: string
  creatorDid?: string
  creatorLabel?: string
  linkedEntities?: string[]
  facets?: Array<{tag?: string}>
  lexicon?: Record<string, string | string[] | undefined>
  /** Adult-classified content is never ingested into the social graph. */
  classification?: 'social' | 'adult_private'
}

export type SemanticEvent = {
  id: string
  subjectId: string
  eventType: string
  timestamp: string
  contentUri?: string
  content?: ContentSemanticsInput
  context: ConventionContext
  scope?: 'personal' | 'collective'
  source: EvidenceSource
  explicit?: boolean
  watchMs?: number
  visibleMs?: number
  progress?: number
  classification?: 'social' | 'adult_private'
}

export type ConventionFeedbackKind =
  | 'show_more'
  | 'show_less'
  | 'mute'
  | 'unmute'
  | 'reset_inference'
  | 'pin'
  | 'remove'

export type ConventionFeedback = {
  subjectId: string
  kind: ConventionFeedbackKind
  conventionId?: string
  label?: string
  type?: ConventionType
  timestamp?: string
  context?: ConventionContext
}
