import * as Y from 'yjs'

import type { SceneGraph, SceneNode } from 'aqua-design-core/src/scene-graph/index'

const LOCAL = Symbol('local')
const REMOTE = Symbol('remote')

/** One Yjs map entry per node: JSON of the node without `childIds`, plus its sibling order. */
type Entry = string

function entryOf(graph: SceneGraph, node: SceneNode): Entry {
  const { childIds: _children, ...rest } = node
  const parent = node.parentId ? graph.nodes.get(node.parentId) : undefined
  const order = parent ? parent.childIds.indexOf(node.id) : 0
  return JSON.stringify({ node: rest, order })
}

export { REMOTE as DESIGN_REMOTE }

export interface GraphBinding {
  /** Pushes the graph's current state into the Y.Doc (call after local edits). */
  syncLocal(): void
  /** True while a remote change is being applied to the graph. */
  isApplying(): boolean
  /** Replaces the graph being bound (after a snapshot restore) and syncs it. */
  rebind(graph: SceneGraph): void
  dispose(): void
}

/**
 * Binds a SceneGraph to a Y.Doc so two people can edit the same design.
 *
 * - Granularity is the node: concurrent edits to *different* nodes merge; to the *same* node the
 *   last writer wins (field-level merge is a later step).
 * - `childIds` are not stored: z-order is `order` per child, rebuilt on every change, ties broken
 *   by node id. Two people adding a child at once keep both children.
 * - Selection/cursor awareness is not included (that is Yjs awareness, a UI concern).
 */
export function bindGraph(initial: SceneGraph, doc: Y.Doc): GraphBinding {
  let graph = initial
  const map = doc.getMap<Entry>('aqua-design-nodes')
  let applying = false

  const syncLocal = () => {
    if (applying) return
    doc.transact(() => {
      const want = new Map<string, Entry>()
      for (const n of graph.getAllNodes()) want.set(n.id, entryOf(graph, n))
      for (const [id, e] of want) if (map.get(id) !== e) map.set(id, e)
      for (const id of [...map.keys()]) if (!want.has(id)) map.delete(id)
    }, LOCAL)
  }

  const onRemote = (event: Y.YMapEvent<Entry>, tr: Y.Transaction) => {
    if (tr.origin === LOCAL) return
    applying = true
    try {
      const touchedParents = new Set<string>()
      for (const [id, change] of event.changes.keys) {
        const prev = graph.nodes.get(id)
        if (prev?.parentId) touchedParents.add(prev.parentId)
        if (change.action === 'delete') {
          graph.nodes.delete(id)
          continue
        }
        const { node } = JSON.parse(map.get(id)!) as { node: SceneNode; order: number }
        const existing = graph.nodes.get(id)
        graph.nodes.set(id, { ...node, childIds: existing?.childIds ?? [] })
        if (node.parentId) touchedParents.add(node.parentId)
      }
      // Rebuild childIds of every affected parent from the shared `order`.
      for (const parentId of touchedParents) {
        const parent = graph.nodes.get(parentId)
        if (!parent) continue
        const kids: { id: string; order: number }[] = []
        for (const [id, e] of map) {
          const { node, order } = JSON.parse(e) as { node: SceneNode; order: number }
          if (node.parentId === parentId) kids.push({ id, order })
        }
        kids.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1))
        parent.childIds = kids.map((k) => k.id)
      }
      for (const id of event.keys.keys()) {
        const n = graph.nodes.get(id)
        if (n) graph.emitter.emit('node:updated', id, {})
      }
    } finally {
      applying = false
    }
  }
  map.observe(onRemote)

  syncLocal()
  return {
    syncLocal,
    isApplying: () => applying,
    rebind(next) {
      graph = next
      syncLocal()
    },
    dispose: () => map.unobserve(onRemote)
  }
}
