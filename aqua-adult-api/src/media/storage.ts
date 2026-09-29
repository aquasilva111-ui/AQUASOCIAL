import {createReadStream, createWriteStream} from 'node:fs'
import {mkdir, rm, stat} from 'node:fs/promises'
import {dirname, join, resolve, sep} from 'node:path'
import {type Readable, type Writable} from 'node:stream'

/**
 * Private object storage. Keys are internal; clients only ever get short
 * signed playback URLs served by this API — never bucket URLs or keys.
 * Production swaps LocalPrivateStorage for an S3-compatible private bucket
 * (e.g. Cloudflare R2) behind the same interface.
 */
export interface PrivateStorage {
  createWriteStream(key: string): Promise<Writable>
  createReadStream(key: string): Readable
  size(key: string): Promise<number | undefined>
  /** Absolute local path for processing workers (local adapter only). */
  localPath(key: string): string
  removePrefix(prefix: string): Promise<void>
}

const KEY_RE = /^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_.-]+)*$/

export function assertSafeKey(key: string): string {
  if (!KEY_RE.test(key) || key.split('/').some(p => p === '.' || p === '..'))
    throw new Error('unsafe storage key')
  return key
}

export class LocalPrivateStorage implements PrivateStorage {
  private root: string
  constructor(root: string) {
    this.root = resolve(root)
  }

  localPath(key: string) {
    const path = resolve(join(this.root, assertSafeKey(key)))
    if (!path.startsWith(this.root + sep)) throw new Error('unsafe storage key')
    return path
  }

  async createWriteStream(key: string) {
    const path = this.localPath(key)
    await mkdir(dirname(path), {recursive: true})
    return createWriteStream(path, {flags: 'wx'})
  }

  createReadStream(key: string) {
    return createReadStream(this.localPath(key))
  }

  async size(key: string) {
    try {
      return (await stat(this.localPath(key))).size
    } catch {
      return undefined
    }
  }

  async removePrefix(prefix: string) {
    await rm(this.localPath(prefix), {recursive: true, force: true})
  }
}
