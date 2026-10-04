import type { CollabTransport } from './types'

/** In-process hub for tests and single-tab use; a network provider replaces it in production. */
export class MemoryHub {
  private subs = new Map<string, Set<{ owner: object; cb: (u: Uint8Array) => void }>>()

  /** Each participant gets its own transport on the shared hub; it never hears its own updates. */
  connect(): CollabTransport {
    const owner = {}
    return {
      publish: (itemId, update) => {
        for (const s of this.subs.get(itemId) ?? []) if (s.owner !== owner) s.cb(update)
      },
      subscribe: (itemId, cb) => {
        const entry = { owner, cb }
        const set = this.subs.get(itemId) ?? new Set()
        set.add(entry)
        this.subs.set(itemId, set)
        return () => set.delete(entry)
      }
    }
  }
}
