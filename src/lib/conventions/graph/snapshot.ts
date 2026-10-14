import {
  CONVENTION_SCHEMA_VERSION,
  type ConventionGraphDiff,
  type ConventionGraphSnapshot,
  type PersonalConventionGraph,
} from '#/lib/conventions/types'
import {parsePersonalGraph} from '#/lib/conventions/validate'

export function takeSnapshot(
  graph: PersonalConventionGraph,
  takenAt: string,
): ConventionGraphSnapshot {
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    subjectId: graph.subjectId,
    revision: graph.revision,
    takenAt,
    graph: JSON.parse(JSON.stringify(graph)) as PersonalConventionGraph,
  }
}

export function graphFromSnapshot(
  snapshot: ConventionGraphSnapshot,
): PersonalConventionGraph | null {
  const parsed = parsePersonalGraph(snapshot?.graph)
  return parsed.ok ? parsed.value : null
}

function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): string[] {
  return fields.filter(field => before[field] !== after[field])
}

export function diffGraphs(
  before: PersonalConventionGraph,
  after: PersonalConventionGraph,
): ConventionGraphDiff {
  const conventions: ConventionGraphDiff['conventions'] = []
  const ids = new Set([
    ...Object.keys(before.conventions),
    ...Object.keys(after.conventions),
  ])
  for (const id of ids) {
    const left = before.conventions[id]
    const right = after.conventions[id]
    if (!left && right) conventions.push({id, kind: 'added', fields: []})
    else if (left && !right) conventions.push({id, kind: 'removed', fields: []})
    else if (left && right) {
      const fields = changedFields(
        left as unknown as Record<string, unknown>,
        right as unknown as Record<string, unknown>,
        [
          'activation',
          'gravity',
          'confidence',
          'status',
          'explicitOverride',
          'version',
        ],
      )
      if (fields.length > 0) conventions.push({id, kind: 'updated', fields})
    }
  }
  const synapseIds = new Set([
    ...Object.keys(before.synapses),
    ...Object.keys(after.synapses),
  ])
  const synapses: ConventionGraphDiff['synapses'] = []
  for (const id of synapseIds) {
    const left = before.synapses[id]
    const right = after.synapses[id]
    if (!left && right) synapses.push({id, kind: 'added'})
    else if (left && !right) synapses.push({id, kind: 'removed'})
    else if (left && right && left.version !== right.version)
      synapses.push({id, kind: 'updated'})
  }
  const synthesisIds = new Set([
    ...Object.keys(before.syntheses),
    ...Object.keys(after.syntheses),
  ])
  const syntheses: ConventionGraphDiff['syntheses'] = []
  for (const id of synthesisIds) {
    const left = before.syntheses[id]
    const right = after.syntheses[id]
    if (!left && right) syntheses.push({id, kind: 'added'})
    else if (left && !right) syntheses.push({id, kind: 'removed'})
    else if (left && right && left.version !== right.version)
      syntheses.push({id, kind: 'updated'})
  }
  return {
    schemaVersion: CONVENTION_SCHEMA_VERSION,
    subjectId: after.subjectId,
    fromRevision: before.revision,
    toRevision: after.revision,
    conventions,
    synapses,
    syntheses,
  }
}
