import {type SemanticHit} from '#/lib/conventions/extraction/types'
import {type RankBlendPolicy} from '#/lib/conventions/policy'
import {
  applyConventionSignals,
  type ConventionRankingSignals,
  neutralRankingSignals,
  rankSignals,
} from '#/lib/conventions/ranking/signals'
import {
  measureSaturation,
  type SaturationSnapshot,
} from '#/lib/conventions/saturation/engine'
import {
  type CollectiveConventionGraph,
  type PersonalConventionGraph,
} from '#/lib/conventions/types'

export type RankAdaptation = {
  signals: ConventionRankingSignals
  adjustedRank?: number
  saturation: SaturationSnapshot
}

export function adaptRank(input: {
  enabled: boolean
  existingRank?: number
  graph: PersonalConventionGraph
  collective: CollectiveConventionGraph | null
  hits: SemanticHit[]
  contextKeys: string[]
  now: string
  topicIds: string[]
  entityIds: string[]
  creatorId?: string
  format?: string
  blend?: RankBlendPolicy
}): RankAdaptation {
  if (!input.enabled) {
    return {
      signals: neutralRankingSignals(),
      adjustedRank: input.existingRank,
      saturation: {topic: 0, entity: 0, creator: 0, format: 0, overall: 0},
    }
  }
  const saturation = measureSaturation(
    input.graph,
    {
      topicIds: input.topicIds,
      entityIds: input.entityIds,
      creatorId: input.creatorId,
      format: input.format,
    },
    input.now,
  )
  const signals = rankSignals({
    graph: input.graph,
    collective: input.collective,
    hits: input.hits,
    contextKeys: input.contextKeys,
    saturation,
  })
  return {
    signals,
    saturation,
    adjustedRank:
      input.existingRank == null
        ? undefined
        : applyConventionSignals(input.existingRank, signals, input.blend),
  }
}
