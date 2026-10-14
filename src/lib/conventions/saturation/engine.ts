import {
  DEFAULT_SATURATION_POLICY,
  type SaturationPolicy,
} from '#/lib/conventions/policy'
import {
  type ExposureRecord,
  type PersonalConventionGraph,
} from '#/lib/conventions/types'
import {clamp} from '#/lib/numbers'

export type SaturationSnapshot = {
  topic: number
  entity: number
  creator: number
  format: number
  overall: number
}

function recent(
  exposures: ExposureRecord[],
  nowMs: number,
  windowMs: number,
): ExposureRecord[] {
  return exposures.filter(exposure => {
    const at = Date.parse(exposure.at)
    return Number.isFinite(at) && nowMs - at <= windowMs && nowMs - at >= 0
  })
}

export function measureSaturation(
  graph: PersonalConventionGraph,
  candidate: {
    topicIds: string[]
    entityIds: string[]
    creatorId?: string
    format?: string
  },
  nowIso: string,
  policy: SaturationPolicy = DEFAULT_SATURATION_POLICY,
): SaturationSnapshot {
  const nowMs = Date.parse(nowIso)
  const window = recent(graph.exposures, nowMs, policy.windowMs)
  const ratio = (count: number) => clamp(count / policy.fullAt, 0, 1)
  const topic = ratio(
    window.filter(exposure =>
      exposure.topicIds.some(id => candidate.topicIds.includes(id)),
    ).length,
  )
  const entity = ratio(
    window.filter(exposure =>
      exposure.entityIds.some(id => candidate.entityIds.includes(id)),
    ).length,
  )
  const creator = ratio(
    candidate.creatorId
      ? window.filter(exposure => exposure.creatorId === candidate.creatorId)
          .length
      : 0,
  )
  const format = ratio(
    candidate.format
      ? window.filter(exposure => exposure.format === candidate.format).length
      : 0,
  )
  return {
    topic,
    entity,
    creator,
    format,
    overall: Math.max(topic, entity, creator, format),
  }
}
