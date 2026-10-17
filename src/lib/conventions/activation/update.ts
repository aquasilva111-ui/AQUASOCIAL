import {
  deriveStatus,
  materializeDecay,
} from '#/lib/conventions/activation/decay'
import {
  type ActivationDecayPolicy,
  type ConfidencePolicy,
  DEFAULT_CONFIDENCE_POLICY,
  DEFAULT_DECAY_POLICY,
} from '#/lib/conventions/policy'
import {
  type Convention,
  CONVENTION_SCHEMA_VERSION,
  type ConventionEvidence,
  type ConventionType,
  type EvidenceSource,
} from '#/lib/conventions/types'
import {clamp} from '#/lib/numbers'

export function confidenceFromMass(
  positiveMass: number,
  explicit: 'none' | 'pin' | 'show_more',
  policy: ConfidencePolicy = DEFAULT_CONFIDENCE_POLICY,
): number {
  const inferred = 1 - Math.exp(-policy.growth * Math.max(0, positiveMass))
  if (explicit === 'pin')
    return clamp(Math.max(inferred, policy.explicitFloor), 0, 1)
  if (explicit === 'show_more')
    return clamp(Math.max(inferred, policy.showMoreFloor), 0, 1)
  return clamp(inferred, 0, 1)
}

export function blankConvention(input: {
  id: string
  namespace: string
  canonicalMeaning: string
  label: string
  aliases: string[]
  type: ConventionType
  now: string
}): Convention {
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    id: input.id,
    namespace: input.namespace,
    canonicalMeaning: input.canonicalMeaning,
    label: input.label,
    aliases: input.aliases.slice(0, 32),
    type: input.type,
    confidence: 0,
    activation: 0,
    gravity: 0,
    activationByContext: {},
    firstSeenAt: input.now,
    lastSeenAt: input.now,
    decayedAt: input.now,
    recurrence: 0,
    persistence: 0,
    source: 'content',
    evidenceCount: 0,
    positiveMass: 0,
    negativeMass: 0,
    depth: 0,
    explicitOverride: 'none',
    contexts: [],
    status: 'emerging',
    hasBeenActive: false,
    removed: false,
    version: 1,
  }
}

function nextActivation(
  current: number,
  weight: number,
  policy: ActivationDecayPolicy,
): number {
  if (weight >= 0) {
    return clamp(current + weight * policy.positiveGain * (1 - current), 0, 1)
  }
  const base = Math.max(current, 0.25)
  return clamp(current + weight * policy.negativeGain * base, 0, 1)
}

export function applyWeight(
  convention: Convention,
  input: {
    weight: number
    now: string
    source: EvidenceSource
    explicit: boolean
    contextKeys: string[]
    kind?: 'pin' | 'show_more' | 'show_less' | 'mute' | 'unmute' | 'remove'
    policy?: ActivationDecayPolicy
    confidencePolicy?: ConfidencePolicy
  },
): Convention {
  const policy = input.policy ?? DEFAULT_DECAY_POLICY
  const decayed = materializeDecay(convention, input.now, policy)
  const wasDormant = decayed.status === 'dormant'
  let next: Convention = {
    ...decayed,
    aliases: [...decayed.aliases],
    contexts: [...decayed.contexts],
    activationByContext: {...decayed.activationByContext},
  }

  if (input.kind === 'unmute') {
    next.explicitOverride = 'none'
    next.activation = next.latentActivation ?? next.activation
    next.latentActivation = undefined
    next.status = deriveStatus(next, Date.parse(input.now), policy)
    next.version += 1
    return next
  }
  if (input.kind === 'remove') {
    next.removed = true
    next.explicitOverride = 'removed'
    next.activation = 0
    next.source = 'explicit'
    next.confidence = Math.max(next.confidence, 0.95)
    next.status = 'dormant'
    next.version += 1
    next.lastSeenAt = input.now
    next.decayedAt = input.now
    return next
  }
  if (input.kind === 'mute') {
    if (next.explicitOverride !== 'mute')
      next.latentActivation = next.activation
    next.explicitOverride = 'mute'
    next.activation = 0
    next.source = 'explicit'
    next.confidence = Math.max(next.confidence, 0.95)
    next.negativeMass += 1
    next.status = 'dormant'
    next.version += 1
    next.lastSeenAt = input.now
    next.decayedAt = input.now
    return next
  }

  const reactivating = wasDormant && input.weight >= policy.reactivationWeight
  let activation = nextActivation(next.activation, input.weight, policy)
  if (reactivating) activation = Math.max(activation, policy.activeThreshold)
  if (input.kind === 'pin') activation = Math.max(activation, 0.92)

  if (input.weight > 0) {
    next.positiveMass += input.weight
    next.recurrence += 1
    if (input.weight >= 0.45) {
      next.depth = clamp(next.depth + 1 / policy.depthUnit, 0, 1)
    }
  } else if (input.weight < 0) {
    next.negativeMass += Math.abs(input.weight)
  }
  next.persistence = clamp(next.recurrence / policy.persistenceUnit, 0, 1)
  next.activation = activation
  next.lastSeenAt = input.now
  next.decayedAt = input.now
  next.evidenceCount += 1
  if (input.explicit) next.source = 'explicit'
  else if (next.source !== 'explicit') next.source = input.source

  if (input.kind === 'pin') next.explicitOverride = 'pin'
  else if (input.kind === 'show_more' && next.explicitOverride === 'none')
    next.explicitOverride = 'show_more'
  else if (input.kind === 'show_less') next.explicitOverride = 'show_less'

  const explicit =
    next.explicitOverride === 'pin'
      ? 'pin'
      : next.explicitOverride === 'show_more'
        ? 'show_more'
        : 'none'
  if (input.weight > 0 || input.explicit) {
    next.confidence = confidenceFromMass(
      next.positiveMass,
      explicit,
      input.confidencePolicy,
    )
  }
  if (input.kind === 'show_less') {
    next.confidence = Math.max(next.confidence, 0.95)
  }

  for (const key of input.contextKeys) {
    if (!next.contexts.includes(key)) next.contexts.push(key)
    const current = next.activationByContext[key] ?? 0
    next.activationByContext[key] = nextActivation(
      current,
      input.weight,
      policy,
    )
    if (reactivating) {
      next.activationByContext[key] = Math.max(
        next.activationByContext[key],
        policy.activeThreshold,
      )
    }
  }
  next.contexts = next.contexts.slice(0, 12)
  if (next.activation >= policy.activeThreshold) next.hasBeenActive = true
  if (next.explicitOverride === 'mute' || next.removed) next.status = 'dormant'
  else next.status = deriveStatus(next, Date.parse(input.now), policy)
  next.version += 1
  return next
}

export function evidenceRecord(input: {
  conventionId: string
  eventId: string
  eventType: string
  contentUri?: string
  context: string
  timestamp: string
  weight: number
  confidence: number
  source: EvidenceSource
}): ConventionEvidence {
  const polarity =
    input.source === 'explicit'
      ? 'explicit_override'
      : input.weight < 0
        ? 'negative'
        : 'positive'
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    id: `evidence:${input.conventionId}:${input.eventId}:${input.eventType}`,
    conventionId: input.conventionId,
    eventId: input.eventId,
    contentUri: input.contentUri,
    eventType: input.eventType,
    context: input.context,
    timestamp: input.timestamp,
    weight: input.weight,
    confidence: input.confidence,
    source: input.source,
    polarity,
  }
}
