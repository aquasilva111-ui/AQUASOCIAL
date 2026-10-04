import * as Y from 'yjs'

import type { ToolAdapter, ToolSession } from '../types'

/** Same shared type the AQUA Docs editor binds to (aqua-docs/src/components/DocEditor.tsx). */
export const DOCS_FRAGMENT = 'document-store'

const REMOTE = Symbol('remote')

/**
 * Docs live in a Y.Doc: stored as a Yjs update, edited through BlockNote in the UI layer,
 * undone with Y.UndoManager (a CRDT cannot go back by restoring snapshots).
 * Markdown export for the Launch Hub is done by the editor, which owns the block schema.
 */
export const docsAdapter: ToolAdapter = {
  kind: 'doc',
  mime: 'application/vnd.aqua.doc+yjs',
  create: () => docSession(new Y.Doc()),
  open(bytes) {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, bytes)
    return docSession(doc)
  }
}

export function docSession(doc: Y.Doc): ToolSession & { doc: Y.Doc } {
  const undo = new Y.UndoManager(doc.getXmlFragment(DOCS_FRAGMENT))
  return {
    doc,
    serialize: () => Y.encodeStateAsUpdate(doc),
    onChange(cb) {
      const h = (_u: Uint8Array, origin: unknown) => {
        if (origin !== REMOTE) cb()
      }
      doc.on('update', h)
      return () => doc.off('update', h)
    },
    history: { undo: () => void undo.undo(), redo: () => void undo.redo(), canUndo: () => undo.canUndo(), canRedo: () => undo.canRedo() },
    collab: {
      onLocalUpdate(cb) {
        const h = (u: Uint8Array, origin: unknown) => {
          if (origin !== REMOTE) cb(u)
        }
        doc.on('update', h)
        return () => doc.off('update', h)
      },
      applyRemote: (u) => Y.applyUpdate(doc, u, REMOTE),
      stateVector: () => Y.encodeStateVector(doc),
      diff: (sv) => Y.encodeStateAsUpdate(doc, sv)
    },
    dispose() {
      undo.destroy()
      doc.destroy()
    }
  }
}
