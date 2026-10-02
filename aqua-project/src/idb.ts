import { sha256Hex, type AssetStore } from './store'
import type { AssetRef } from './types'

/** Browser persistence for assets (IndexedDB). Same contract as MemoryAssetStore. */
export class IdbAssetStore implements AssetStore {
  private db: Promise<IDBDatabase>

  constructor(
    name = 'aqua-assets',
    factory: IDBFactory = globalThis.indexedDB
  ) {
    this.db = new Promise((resolve, reject) => {
      const req = factory.open(name, 1)
      req.onupgradeneeded = () => req.result.createObjectStore('blobs', { keyPath: 'hash' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction('blobs', mode).objectStore('blobs'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async put(bytes: Uint8Array, mime: string): Promise<AssetRef> {
    const hash = await sha256Hex(bytes)
    const ref: AssetRef = { hash, mime, size: bytes.byteLength }
    if (!(await this.has(hash))) await this.tx('readwrite', (s) => s.put({ hash, mime, size: ref.size, bytes: bytes.slice() }))
    return ref
  }

  async get(hash: string) {
    const row = await this.tx<{ hash: string; mime: string; size: number; bytes: Uint8Array } | undefined>('readonly', (s) => s.get(hash))
    return row && { ref: { hash: row.hash, mime: row.mime, size: row.size }, bytes: new Uint8Array(row.bytes) }
  }

  async has(hash: string) {
    return (await this.tx<IDBValidKey | undefined>('readonly', (s) => s.getKey(hash))) !== undefined
  }

  /** Deletes assets not in `keep` (use `liveHashes(project)`); returns how many were removed. */
  async collect(keep: Set<string>): Promise<number> {
    const keys = await this.tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    const drop = keys.filter((k) => !keep.has(String(k)))
    for (const k of drop) await this.tx('readwrite', (s) => s.delete(k))
    return drop.length
  }
}
