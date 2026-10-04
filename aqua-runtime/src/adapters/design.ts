import { addTitle, createAquaDocument } from 'aqua-design-core/src/brand/document'
import { createPresentation, toPptx, toRevealHtml, type Presentation } from 'aqua-design-core/src/presentation'
import { deserializeDocument, serializeDocument } from 'aqua-design-core/src/serialize'
import type { SceneGraph } from 'aqua-design-core/src/scene-graph/index'
import type { ItemKind } from 'aqua-project/src/index'

import * as Y from 'yjs'

import type { ExportedFile, ToolAdapter, ToolSession } from '../types'
import { bindGraph, DESIGN_REMOTE } from './design-collab'

export interface DesignAdapterOptions {
  /** Draws the graph to a PNG. In the browser this wraps `FabricRenderer`; absent in headless runs. */
  renderPng?: (graph: SceneGraph) => Promise<Uint8Array>
}

/** Design and Presentations share one engine; only the item kind (and starting format) differ. */
export function designAdapter(kind: 'design' | 'presentation', opts: DesignAdapterOptions = {}): ToolAdapter {
  return {
    kind: kind as ItemKind,
    mime: 'application/vnd.aqua.design+json',
    create(name) {
      if (kind === 'presentation') return session(createPresentation(name).graph, opts)
      const doc = createAquaDocument('post')
      addTitle(doc, name)
      return session(doc.graph, opts)
    },
    open: (bytes) => session(deserializeDocument(bytes), opts)
  }
}

export type DesignSession = ToolSession & {
  readonly graph: SceneGraph
  /** Presentation view of the same graph: first page, its top-level frames are the slides. */
  presentation(): Presentation
  toPptx(title?: string): Promise<Uint8Array>
  toRevealHtml(opts?: { revealBase?: string; title?: string }): string
}

function session(initial: SceneGraph, opts: DesignAdapterOptions): DesignSession {
  let graph = initial
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const ydoc = new Y.Doc()
  const binding = bindGraph(graph, ydoc)
  const local = () => {
    if (binding.isApplying()) return // a remote edit: not a local change (no autosave/undo entry)
    binding.syncLocal()
    emit()
  }
  let off = graph.onNodeEvents({ created: local, updated: local, deleted: local, reparented: local, reordered: local })

  return {
    get graph() {
      return graph
    },
    presentation: () => ({ graph, pageId: graph.getPages()[0].id }),
    toPptx(title) {
      return toPptx({ graph, pageId: graph.getPages()[0].id }, title)
    },
    toRevealHtml(o) {
      return toRevealHtml({ graph, pageId: graph.getPages()[0].id }, o)
    },
    serialize: () => serializeDocument(graph),
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    restore(bytes) {
      off()
      graph = deserializeDocument(bytes)
      binding.rebind(graph)
      off = graph.onNodeEvents({ created: local, updated: local, deleted: local, reparented: local, reordered: local })
    },
    async export(capability): Promise<ExportedFile | undefined> {
      if (capability !== 'image' || !opts.renderPng) return undefined
      return { bytes: await opts.renderPng(graph), mime: 'image/png' }
    },
    collab: {
      onLocalUpdate(cb) {
        const h = (u: Uint8Array, origin: unknown) => {
          if (origin !== DESIGN_REMOTE) cb(u)
        }
        ydoc.on('update', h)
        return () => ydoc.off('update', h)
      },
      applyRemote: (u) => Y.applyUpdate(ydoc, u, DESIGN_REMOTE),
      stateVector: () => Y.encodeStateVector(ydoc),
      diff: (sv) => Y.encodeStateAsUpdate(ydoc, sv)
    },
    dispose() {
      off()
      binding.dispose()
      ydoc.destroy()
    }
  }
}
