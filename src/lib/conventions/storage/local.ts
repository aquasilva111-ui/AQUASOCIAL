import {createMemoryConventionStore} from '#/lib/conventions/storage/memory'
import {
  type ConventionStore,
  type KeyValuePort,
} from '#/lib/conventions/storage/types'
import {
  parseCollectiveGraph,
  parsePersonalGraph,
} from '#/lib/conventions/validate'

const GRAPH_PREFIX = 'aqua.convention.graph.'
const COLLECTIVE_PREFIX = 'aqua.convention.collective.'

/**
 * Key-value adapter. The port is injected, so this file does not touch
 * localStorage or MMKV itself.
 */
export function createLocalConventionStore(
  port: KeyValuePort,
): ConventionStore {
  const memory = createMemoryConventionStore()

  return {
    ...memory,
    async getConvention(subjectId, id) {
      const graph = await this.getGraph(subjectId)
      return graph?.conventions[id] ?? null
    },
    async putConvention(subjectId, convention) {
      const graph = await this.getGraph(subjectId)
      if (!graph) return
      graph.conventions[convention.id] = convention
      await this.saveGraph(graph)
    },
    async listConventions(subjectId) {
      const graph = await this.getGraph(subjectId)
      return Object.values(graph?.conventions ?? {})
    },
    async getGraph(subjectId) {
      const read = await this.readGraph(subjectId)
      return read.ok ? read.graph : null
    },
    async readGraph(subjectId) {
      try {
        const raw = port.get(GRAPH_PREFIX + subjectId)
        if (raw == null) return {ok: true, graph: null}
        const parsed = parsePersonalGraph(JSON.parse(raw) as unknown)
        if (!parsed.ok) return parsed
        return {ok: true, graph: parsed.value}
      } catch {
        return {ok: false, reason: 'malformed-json'}
      }
    },
    async saveGraph(graph) {
      port.set(GRAPH_PREFIX + graph.subjectId, JSON.stringify(graph))
    },
    async getSynapses(subjectId) {
      const graph = await this.getGraph(subjectId)
      return Object.values(graph?.synapses ?? {})
    },
    async saveSynapse(subjectId, synapse) {
      const graph = await this.getGraph(subjectId)
      if (!graph) return
      graph.synapses[synapse.id] = synapse
      await this.saveGraph(graph)
    },
    async getSyntheses(subjectId) {
      const graph = await this.getGraph(subjectId)
      return Object.values(graph?.syntheses ?? {})
    },
    async saveSynthesis(subjectId, synthesis) {
      const graph = await this.getGraph(subjectId)
      if (!graph) return
      graph.syntheses[synthesis.id] = synthesis
      await this.saveGraph(graph)
    },
    async getCollective(scopeId) {
      const read = await this.readCollective(scopeId)
      return read.ok ? read.graph : null
    },
    async readCollective(scopeId) {
      try {
        const raw = port.get(COLLECTIVE_PREFIX + scopeId)
        if (raw == null) return {ok: true, graph: null}
        const parsed = parseCollectiveGraph(JSON.parse(raw) as unknown)
        if (!parsed.ok) return parsed
        return {ok: true, graph: parsed.value}
      } catch {
        return {ok: false, reason: 'malformed-json'}
      }
    },
    async saveCollective(graph) {
      port.set(COLLECTIVE_PREFIX + graph.scopeId, JSON.stringify(graph))
    },
  }
}
