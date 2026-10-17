import {
  type Convention,
  type PersonalConventionGraph,
} from '#/lib/conventions/types'

function list(graph: PersonalConventionGraph): Convention[] {
  return Object.values(graph.conventions).filter(
    convention => !convention.removed,
  )
}

export function activeConventions(
  graph: PersonalConventionGraph,
): Convention[] {
  return list(graph).filter(convention => convention.status === 'active')
}

export function emergingConventions(
  graph: PersonalConventionGraph,
): Convention[] {
  return list(graph).filter(convention => convention.status === 'emerging')
}

export function weakeningConventions(
  graph: PersonalConventionGraph,
): Convention[] {
  return list(graph).filter(convention => convention.status === 'weakening')
}

export function dormantConventions(
  graph: PersonalConventionGraph,
): Convention[] {
  return list(graph).filter(convention => convention.status === 'dormant')
}

export function byGravity(
  graph: PersonalConventionGraph,
  limit = 20,
): Convention[] {
  return list(graph)
    .sort((a, b) => b.gravity - a.gravity || (a.id < b.id ? -1 : 1))
    .slice(0, limit)
}

export function relatedConventionIds(
  graph: PersonalConventionGraph,
  conventionId: string,
): string[] {
  const ids = new Set<string>()
  for (const synapse of Object.values(graph.synapses)) {
    if (synapse.strength <= 0) continue
    if (synapse.fromConventionId === conventionId)
      ids.add(synapse.toConventionId)
    if (synapse.toConventionId === conventionId)
      ids.add(synapse.fromConventionId)
  }
  return [...ids]
}
