import {type SemanticHit} from '#/lib/conventions/extraction/types'
import {
  DEFAULT_RANK_BLEND,
  type RankBlendPolicy,
} from '#/lib/conventions/policy'
import {type SaturationSnapshot} from '#/lib/conventions/saturation/engine'
import {
  type CollectiveConventionGraph,
  type Convention,
  type PersonalConventionGraph,
} from '#/lib/conventions/types'
import {clamp} from '#/lib/numbers'

export type ConventionRankingSignals = {
  enabled: boolean
  neutral: boolean
  personalRelevance: number
  personalGravity: number
  collectiveGravity: number
  novelty: number
  saturationPenalty: number
  confidence: number
}

export function neutralRankingSignals(): ConventionRankingSignals {
  return {
    enabled: false,
    neutral: true,
    personalRelevance: 0,
    personalGravity: 0,
    collectiveGravity: 0,
    novelty: 0,
    saturationPenalty: 0,
    confidence: 0,
  }
}

function contextualActivation(
  convention: Convention,
  contextKeys: string[],
): number {
  if (contextKeys.length === 0) return convention.activation
  let total = 0
  let seen = 0
  for (const key of contextKeys) {
    const value = convention.activationByContext[key]
    if (value == null) continue
    total += value
    seen += 1
  }
  if (seen === 0) return convention.activation
  return clamp(convention.activation * 0.6 + (total / seen) * 0.4, 0, 1)
}

export function rankSignals(input: {
  graph: PersonalConventionGraph
  collective: CollectiveConventionGraph | null
  hits: SemanticHit[]
  contextKeys: string[]
  saturation: SaturationSnapshot
}): ConventionRankingSignals {
  if (input.hits.length === 0) {
    return {
      ...neutralRankingSignals(),
      enabled: true,
      neutral: false,
      novelty: 1,
    }
  }
  let relevance = 0
  let gravity = 0
  let collective = 0
  let confidence = 0
  let weight = 0
  for (const hit of input.hits) {
    const convention = input.graph.conventions[hit.id]
    const hitWeight = hit.confidence || 0.5
    weight += hitWeight
    if (
      !convention ||
      convention.removed ||
      convention.explicitOverride === 'mute'
    ) {
      continue
    }
    const activation = contextualActivation(convention, input.contextKeys)
    const suppressed = convention.explicitOverride === 'show_less' ? 0.35 : 1
    relevance += activation * suppressed * hitWeight
    gravity += convention.gravity * suppressed * hitWeight
    confidence += convention.confidence * hitWeight
    collective +=
      (input.collective?.conventions[hit.id]?.gravity ?? 0) * hitWeight
  }
  const divide = weight || 1
  const personalRelevance = clamp(relevance / divide, 0, 1)
  const personalGravity = clamp(gravity / divide, 0, 1)
  return {
    enabled: true,
    neutral: false,
    personalRelevance,
    personalGravity,
    collectiveGravity: clamp(collective / divide, 0, 1),
    novelty: clamp(1 - personalRelevance, 0, 1),
    saturationPenalty: input.saturation.overall,
    confidence: clamp(confidence / divide, 0, 1),
  }
}

/**
 * Adds convention signals to an existing rank. Neutral signals leave the
 * existing rank untouched, including when the engine is off or degraded.
 */
export function applyConventionSignals(
  existingRank: number,
  signals: ConventionRankingSignals,
  policy: RankBlendPolicy = DEFAULT_RANK_BLEND,
): number {
  if (!Number.isFinite(existingRank)) return 0
  if (!signals.enabled || signals.neutral) return existingRank
  return (
    existingRank +
    policy.personalRelevance * signals.personalRelevance +
    policy.personalGravity * signals.personalGravity +
    policy.collectiveGravity * signals.collectiveGravity +
    policy.novelty * signals.novelty -
    policy.saturation * signals.saturationPenalty
  )
}
