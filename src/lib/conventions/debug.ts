import {
  activeConventions,
  byGravity,
  dormantConventions,
  emergingConventions,
  weakeningConventions,
} from '#/lib/conventions/graph/queries'
import {type ConventionRankingSignals} from '#/lib/conventions/ranking/signals'
import {type PersonalConventionGraph} from '#/lib/conventions/types'

export type ConventionDebugView = {
  subjectId: string
  revision: number
  updatedAt: string
  counts: {
    active: number
    emerging: number
    weakening: number
    dormant: number
    synapses: number
    syntheses: number
  }
  conventions: Array<{
    id: string
    label: string
    type: string
    status: string
    activation: number
    gravity: number
    confidence: number
    evidenceCount: number
    explicitOverride: string
  }>
  synapses: Array<{
    id: string
    fromConventionId: string
    toConventionId: string
    strength: number
    confidence: number
    recurrence: number
  }>
  syntheses: Array<{
    id: string
    conventionIds: string[]
    synapseIds: string[]
    confidence: number
  }>
  signals?: ConventionRankingSignals
}

/** Developer inspector. It does not render a public screen. */
export function inspectConventions(
  graph: PersonalConventionGraph,
  signals?: ConventionRankingSignals,
): ConventionDebugView {
  const strongest = byGravity(graph, 40)
  return {
    subjectId: graph.subjectId,
    revision: graph.revision,
    updatedAt: graph.updatedAt,
    counts: {
      active: activeConventions(graph).length,
      emerging: emergingConventions(graph).length,
      weakening: weakeningConventions(graph).length,
      dormant: dormantConventions(graph).length,
      synapses: Object.values(graph.synapses).filter(
        synapse => synapse.strength > 0,
      ).length,
      syntheses: Object.keys(graph.syntheses).length,
    },
    conventions: strongest.map(convention => ({
      id: convention.id,
      label: convention.label,
      type: convention.type,
      status: convention.status,
      activation: convention.activation,
      gravity: convention.gravity,
      confidence: convention.confidence,
      evidenceCount: convention.evidenceCount,
      explicitOverride: convention.explicitOverride,
    })),
    synapses: Object.values(graph.synapses)
      .filter(synapse => synapse.strength > 0)
      .map(synapse => ({
        id: synapse.id,
        fromConventionId: synapse.fromConventionId,
        toConventionId: synapse.toConventionId,
        strength: synapse.strength,
        confidence: synapse.confidence,
        recurrence: synapse.recurrence,
      })),
    syntheses: Object.values(graph.syntheses).map(synthesis => ({
      id: synthesis.id,
      conventionIds: synthesis.conventionIds,
      synapseIds: synthesis.synapseIds,
      confidence: synthesis.confidence,
    })),
    signals,
  }
}
