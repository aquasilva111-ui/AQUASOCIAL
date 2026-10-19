import {
  CONVENTION_SCHEMA_VERSION,
  type ConventionSynapse,
  type PersonalConventionGraph,
  type Synthesis,
} from '#/lib/conventions/types'

/**
 * Groups conventions already linked by synapses. This is a computed
 * structure, not generated prose, and it is not the distributed
 * Base de Sínteses.
 */
export function buildSyntheses(
  graph: PersonalConventionGraph,
  now: string,
  minStrength = 0.2,
): Synthesis[] {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const current = parent.get(id) ?? id
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }
  const unite = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  const usable = Object.values(graph.synapses).filter(
    synapse => synapse.strength >= minStrength,
  )
  for (const synapse of usable) {
    parent.set(
      synapse.fromConventionId,
      parent.get(synapse.fromConventionId) ?? synapse.fromConventionId,
    )
    parent.set(
      synapse.toConventionId,
      parent.get(synapse.toConventionId) ?? synapse.toConventionId,
    )
    unite(synapse.fromConventionId, synapse.toConventionId)
  }

  const groups = new Map<
    string,
    {conventions: Set<string>; synapses: ConventionSynapse[]}
  >()
  for (const synapse of usable) {
    const root = find(synapse.fromConventionId)
    const group = groups.get(root) ?? {
      conventions: new Set<string>(),
      synapses: [],
    }
    group.conventions.add(synapse.fromConventionId)
    group.conventions.add(synapse.toConventionId)
    group.synapses.push(synapse)
    groups.set(root, group)
  }

  const syntheses: Synthesis[] = []
  for (const group of groups.values()) {
    if (group.conventions.size < 2) continue
    const conventionIds = [...group.conventions].sort()
    const synapseIds = group.synapses.map(synapse => synapse.id).sort()
    const confidence =
      group.synapses.reduce((sum, synapse) => sum + synapse.confidence, 0) /
      group.synapses.length
    const id = `synthesis:${graph.subjectId}:${conventionIds.join('+')}`
    syntheses.push({
      schemaVersion: CONVENTION_SCHEMA_VERSION,
      id,
      subjectId: graph.subjectId,
      scope: 'personal',
      conventionIds,
      synapseIds,
      contexts: [],
      confidence,
      createdAt: graph.syntheses[id]?.createdAt ?? now,
      updatedAt: now,
      sourceRevision: graph.revision,
      version: (graph.syntheses[id]?.version ?? 0) + 1,
    })
  }
  return syntheses
}
