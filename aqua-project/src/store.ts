import type { AssetRef } from './types'

/** Where bytes live. Memory here; IndexedDB (web) and PDS blobs are other adapters. */
export interface AssetStore {
  put(bytes: Uint8Array, mime: string): Promise<AssetRef>
  get(hash: string): Promise<{ ref: AssetRef; bytes: Uint8Array } | undefined>
  has(hash: string): Promise<boolean>
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export class MemoryAssetStore implements AssetStore {
  private blobs = new Map<string, { ref: AssetRef; bytes: Uint8Array }>()

  async put(bytes: Uint8Array, mime: string): Promise<AssetRef> {
    const hash = await sha256Hex(bytes)
    const existing = this.blobs.get(hash)
    if (existing) return existing.ref
    const ref: AssetRef = { hash, mime, size: bytes.byteLength }
    this.blobs.set(hash, { ref, bytes: bytes.slice() })
    return ref
  }

  async get(hash: string) {
    return this.blobs.get(hash)
  }

  async has(hash: string) {
    return this.blobs.has(hash)
  }
}
