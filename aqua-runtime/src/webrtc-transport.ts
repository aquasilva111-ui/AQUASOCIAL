import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import type { CollabTransport } from './types'

/**
 * CollabTransport using y-webrtc (same stack as aqua-docs).
 * Each itemId becomes a room: aqua-hub:<itemId>
 */
export class WebRTCTransport implements CollabTransport {
  private providers = new Map<string, WebrtcProvider>()

  constructor(
    private signaling: string[] = ['wss://signaling.yjs.dev'],
  ) {}

  publish(_itemId: string, _update: Uint8Array) {
    // WebrtcProvider syncs the Y.Doc automatically once created.
    // This method exists to satisfy the interface; the real sync happens inside the provider.
  }

  subscribe(itemId: string, cb: (update: Uint8Array) => void) {
    const provider = this.ensure(itemId)
    const doc = provider.doc

    const handler = () => {
      cb(Y.encodeStateAsUpdate(doc))
    }
    doc.on('update', handler)

    return () => {
      doc.off('update', handler)
    }
  }

  private ensure(itemId: string): WebrtcProvider {
    let provider = this.providers.get(itemId)
    if (!provider) {
      const doc = new Y.Doc()
      provider = new WebrtcProvider(`aqua-hub:${itemId}`, doc, {
        signaling: this.signaling,
      })
      this.providers.set(itemId, provider)
    }
    return provider
  }

  dispose() {
    for (const p of this.providers.values()) {
      p.destroy()
    }
    this.providers.clear()
  }
}
