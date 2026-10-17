import {type SemanticHit} from '#/lib/conventions/extraction/types'
import {type ConventionRankingSignals} from '#/lib/conventions/ranking/signals'
import {
  CONVENTION_SCHEMA_VERSION,
  type ConventionEvidence,
  type PersonalConventionGraph,
} from '#/lib/conventions/types'

const REASONS: Record<string, string> = {
  save: 'saved similar posts',
  follow: 'explicitly follows related creator',
  subscribe: 'explicitly follows related creator',
  search: 'searched related terms',
  show_more: 'explicitly asked to show more',
  pin: 'explicitly pinned this convention',
  show_less: 'explicitly asked to show less',
  mute: 'explicitly muted this convention',
  watch_time: 'watched similar videos',
  video_complete: 'watched similar videos',
  video_progress: 'watched similar videos',
  long_view: 'watched similar videos',
  view: 'viewed similar content',
  repost: 'reposted similar content',
  like: 'liked similar content',
}

export type ConventionExplanation = {
  schemaVersion: number
  subjectId: string
  contentUri?: string
  rankedBecause: Array<{
    conventionId: string
    label: string
    personalActivation: number
    personalGravity: number
    collectiveGravity: number
    evidence: string[]
    saturation: number
    confidence: number
  }>
  signals: ConventionRankingSignals
  note: string
}

function reasons(
  evidence: ConventionEvidence[],
  conventionId: string,
): string[] {
  const phrases: string[] = []
  for (const item of evidence) {
    if (item.conventionId !== conventionId) continue
    const phrase = REASONS[item.eventType] ?? item.eventType
    if (!phrases.includes(phrase)) phrases.push(phrase)
    if (phrases.length >= 4) break
  }
  return phrases
}

export function explainRanking(input: {
  graph: PersonalConventionGraph
  hits: SemanticHit[]
  signals: ConventionRankingSignals
  collectiveGravityById: Record<string, number>
  saturation: number
  contentUri?: string
}): ConventionExplanation {
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    subjectId: input.graph.subjectId,
    contentUri: input.contentUri,
    rankedBecause: input.hits.map(hit => {
      const convention = input.graph.conventions[hit.id]
      return {
        conventionId: hit.id,
        label: convention?.label ?? hit.label,
        personalActivation: convention?.activation ?? 0,
        personalGravity: convention?.gravity ?? 0,
        collectiveGravity: input.collectiveGravityById[hit.id] ?? 0,
        evidence: reasons(input.graph.evidence, hit.id),
        saturation: input.saturation,
        confidence: convention?.confidence ?? hit.confidence,
      }
    }),
    signals: input.signals,
    note: input.signals.neutral
      ? 'Convention signals are neutral. The existing rank is unchanged.'
      : 'Signals describe content meaning in this graph. They do not describe who the person is.',
  }
}
