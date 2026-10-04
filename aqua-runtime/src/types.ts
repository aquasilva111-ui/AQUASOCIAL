import type { ItemKind, LaunchCapability } from 'aqua-project/src/index'

export interface ExportedFile {
  bytes: Uint8Array
  mime: string
}

/** One open item of any tool. Tools implement this; the runtime never knows their internals. */
export interface ToolSession {
  /** Current content as bytes, what gets stored in the project. */
  serialize(): Uint8Array
  /** Calls back after every local edit. Returns an unsubscribe. */
  onChange(cb: () => void): () => void
  /** Native history; when absent the runtime falls back to snapshots. */
  history?: { undo(): void; redo(): void; canUndo(): boolean; canRedo(): boolean }
  /** Restores a snapshot taken from `serialize()` (used by snapshot-based undo). */
  restore?(bytes: Uint8Array): void
  /** Collaboration: updates produced locally, and remote updates to apply. */
  collab?: {
    onLocalUpdate(cb: (update: Uint8Array) => void): () => void
    applyRemote(update: Uint8Array): void
    /** Yjs state vector: what this peer already has. */
    stateVector(): Uint8Array
    /** What a peer with state vector `sv` is missing. */
    diff(sv: Uint8Array): Uint8Array
  }
  /** Renders the item for a Launch Hub capability; undefined when this tool cannot. */
  export?(capability: LaunchCapability): Promise<ExportedFile | undefined>
  dispose(): void
}

export interface ToolAdapter {
  kind: ItemKind
  mime: string
  create(name: string): ToolSession
  open(bytes: Uint8Array): ToolSession
}

/** How edits reach other people. A WebRTC/WebSocket provider implements this. */
export interface CollabTransport {
  publish(itemId: string, update: Uint8Array): void
  subscribe(itemId: string, cb: (update: Uint8Array) => void): () => void
}
