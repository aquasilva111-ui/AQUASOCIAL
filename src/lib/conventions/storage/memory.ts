import {
  type CollectiveReadResult,
  type ConventionStore,
  type GraphReadResult,
} from '#/lib/conventions/storage/types'
import {
  type CollectiveConventionGraph,
  type PersonalConventionGraph,
} from '#/lib/conventions/types'

function clone<T>(value: T): T {
  return structuredClone(value)
}

export function createMemoryConventionStore(): ConventionStore {
  const personal = new Map<string, PersonalConventionGraph>()
  const collective = new Map<string, CollectiveConventionGraph>()

  function readGraph(subjectId: string): Promise<GraphReadResult> {
    const graph = personal.get(subjectId)
    return Promise.resolve({ok: true, graph: graph ? clone(graph) : null})
  }

  function readCollective(scopeId: string): Promise<CollectiveReadResult> {
    const graph = collective.get(scopeId)
    return Promise.resolve({
      ok: true,
      graph: graph ? clone(graph) : null,
    })
  }

  return {
    async getConvention(subjectId, id) {
      return personal.get(subjectId)?.conventions[id] ?? null
    },
    async putConvention(subjectId, convention) {
      const graph = personal.get(subjectId)
      if (!graph) return
      graph.conventions[convention.id] = convention
    },
    async listConventions(subjectId) {
      return Object.values(personal.get(subjectId)?.conventions ?? {})
    },
    async getGraph(subjectId) {
      return personal.get(subjectId) ?? null
    },
    readGraph,
    async saveGraph(graph) {
      personal.set(graph.subjectId, clone(graph))
    },
    async getSynapses(subjectId) {
      return Object.values(personal.get(subjectId)?.synapses ?? {})
    },
    async saveSynapse(subjectId, synapse) {
      const graph = personal.get(subjectId)
      if (!graph) return
      graph.synapses[synapse.id] = synapse
    },
    async getSyntheses(subjectId) {
      return Object.values(personal.get(subjectId)?.syntheses ?? {})
    },
    async saveSynthesis(subjectId, synthesis) {
      const graph = personal.get(subjectId)
      if (!graph) return
      graph.syntheses[synthesis.id] = synthesis
    },
    async getCollective(scopeId) {
      return collective.get(scopeId) ?? null
    },
    readCollective,
    async saveCollective(graph) {
      collective.set(graph.scopeId, clone(graph))
    },
  }
}
