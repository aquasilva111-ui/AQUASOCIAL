import { SceneGraph, type SceneNode } from './scene-graph'

const FORMAT = 'aqua-design/1'

interface Serialized {
  format: typeof FORMAT
  rootId: string
  nodes: SceneNode[]
}

/**
 * Document <-> bytes (JSON) so the Design Core can live in an AQUA Project.
 * Embedded image bytes (`graph.images`) are not included yet: images should be
 * AQUA Assets referenced by hash, not inlined in the document.
 */
export function serializeDocument(graph: SceneGraph): Uint8Array {
  const data: Serialized = { format: FORMAT, rootId: graph.rootId, nodes: [...graph.getAllNodes()] }
  return new TextEncoder().encode(JSON.stringify(data))
}

export function deserializeDocument(bytes: Uint8Array): SceneGraph {
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Serialized
  if (data.format !== FORMAT || !Array.isArray(data.nodes)) throw new Error('Not an AQUA design document')
  const graph = new SceneGraph()
  graph.nodes = new Map(data.nodes.map((n) => [n.id, n]))
  graph.rootId = data.rootId
  if (!graph.nodes.has(graph.rootId)) throw new Error('Design document has no root')
  return graph
}
