import {
  type CollectiveGravityPolicy,
  DEFAULT_COLLECTIVE_GRAVITY_POLICY,
} from '#/lib/conventions/policy'
import {
  type CollectiveConventionGraph,
  type CollectiveConventionNode,
  CONVENTION_SCHEMA_VERSION,
} from '#/lib/conventions/types'
import {emptyCollectiveGraph} from '#/lib/conventions/validate'
import {clamp} from '#/lib/numbers'

export function collectiveGravity(
  node: CollectiveConventionNode,
  policy: CollectiveGravityPolicy = DEFAULT_COLLECTIVE_GRAVITY_POLICY,
): number {
  const volume = 1 - Math.exp(-node.eventVolume / policy.volumeScale)
  const actors = clamp(node.uniqueActorCount / policy.actorScale, 0, 1)
  const creators = clamp(node.uniqueCreatorCount / policy.creatorScale, 0, 1)
  const communities = clamp(
    node.communities.length / policy.communityScale,
    0,
    1,
  )
  const social = clamp(
    (node.reposts + node.saves + node.comments) / policy.socialScale,
    0,
    1,
  )
  const velocity = clamp(
    node.recentTimestamps.length / policy.velocityScale,
    0,
    1,
  )
  const weights = policy.weights
  return clamp(
    weights.volume * volume +
      weights.actors * actors +
      weights.creators * creators +
      weights.depth * node.watchDepth +
      weights.social * social +
      weights.persistence * node.persistence +
      weights.communities * communities +
      weights.velocity * velocity,
    0,
    1,
  )
}

function remember(
  list: string[],
  value: string | undefined,
  cap: number,
): string[] {
  if (!value || list.includes(value)) return list
  return [...list, value].slice(-cap)
}

export function observeCollectiveEvent(
  graph: CollectiveConventionGraph | null,
  input: {
    scopeId: string
    conventionIds: string[]
    actorId?: string
    creatorId?: string
    community?: string
    eventType: string
    timestamp: string
    watchRatio?: number
  },
  policy: CollectiveGravityPolicy = DEFAULT_COLLECTIVE_GRAVITY_POLICY,
): CollectiveConventionGraph {
  const next = graph ?? emptyCollectiveGraph(input.scopeId, input.timestamp)
  for (const conventionId of input.conventionIds) {
    const current: CollectiveConventionNode = next.conventions[
      conventionId
    ] ?? {
      schemaVersion: CONVENTION_SCHEMA_VERSION,
      conventionId,
      eventVolume: 0,
      uniqueActorCount: 0,
      actorIds: [],
      uniqueCreatorCount: 0,
      creatorIds: [],
      communities: [],
      reposts: 0,
      comments: 0,
      saves: 0,
      watchDepth: 0,
      persistence: 0,
      gravity: 0,
      firstSeenAt: input.timestamp,
      lastSeenAt: input.timestamp,
      recentTimestamps: [],
    }
    const actorIds = remember(current.actorIds, input.actorId, policy.actorCap)
    const creatorIds = remember(
      current.creatorIds,
      input.creatorId,
      policy.creatorCap,
    )
    const communities = remember(current.communities, input.community, 32)
    const span = Date.parse(input.timestamp) - Date.parse(current.firstSeenAt)
    const node: CollectiveConventionNode = {
      ...current,
      eventVolume: current.eventVolume + 1,
      actorIds,
      uniqueActorCount: Math.max(current.uniqueActorCount, actorIds.length),
      creatorIds,
      uniqueCreatorCount: Math.max(
        current.uniqueCreatorCount,
        creatorIds.length,
      ),
      communities,
      reposts: current.reposts + (input.eventType === 'repost' ? 1 : 0),
      comments: current.comments + (input.eventType === 'comment' ? 1 : 0),
      saves: current.saves + (input.eventType === 'save' ? 1 : 0),
      watchDepth:
        input.watchRatio == null
          ? current.watchDepth
          : clamp(current.watchDepth * 0.8 + input.watchRatio * 0.2, 0, 1),
      persistence: clamp(
        Math.max(current.persistence, span / (30 * 24 * 60 * 60 * 1000)),
        0,
        1,
      ),
      lastSeenAt: input.timestamp,
      recentTimestamps: [...current.recentTimestamps, input.timestamp].slice(
        -policy.timestampCap,
      ),
    }
    node.gravity = collectiveGravity(node, policy)
    next.conventions[conventionId] = node
  }
  next.revision += 1
  next.updatedAt = input.timestamp
  return next
}
