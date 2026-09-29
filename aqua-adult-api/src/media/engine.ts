import {spawn} from 'node:child_process'
import {createHash, randomBytes} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname} from 'node:path'
import {type Readable, Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import {type Config} from '../config.js'
import {type Db, type Queryable} from '../db/index.js'
import {badRequest, forbidden, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {signPlayback, verifyPlayback} from './signing.js'
import {ALLOWED_MIME, sniff} from './sniff.js'
import {assertSafeKey, type PrivateStorage} from './storage.js'

const require = createRequire(import.meta.url)
const FFMPEG: string = process.env.FFMPEG_BIN ?? require('ffmpeg-static')

export type AssetKind = 'video' | 'image' | 'audio' | 'captions'
export type AssetStatus =
  | 'UPLOADING'
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'QUARANTINED'
  | 'REMOVED'

/**
 * Content scanning / hash-matching hooks (FASE 14 plugs real providers in).
 * No home-made detection of illegal material: this is only the seam.
 */
export type ScanHook = (
  asset: {id: string; kind: string},
  filePath: string,
) => Promise<'ok' | 'quarantine'>
const scanHooks: ScanHook[] = []
export function registerScanHook(hook: ScanHook): () => void {
  scanHooks.push(hook)
  return () => {
    const i = scanHooks.indexOf(hook)
    if (i >= 0) scanHooks.splice(i, 1)
  }
}

const UPLOAD_TTL_MS = 15 * 60_000
const RENDITIONS = [
  {name: '720p', height: 720, bandwidth: 2_800_000},
  {name: '360p', height: 360, bandwidth: 900_000},
]

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * AQUA Media Engine: stores, processes and serves media. It knows media;
 * it does not decide who may watch — callers pass an Entitlements decision
 * in, and the engine only mints and verifies short-lived authorizations.
 */
export class MediaEngine {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private db: Db,
    readonly storage: PrivateStorage,
    private config: Config,
  ) {}

  // ---------------------------------------------------------------- upload

  async createUpload(
    ownerDid: string,
    input: {
      kind: AssetKind
      purpose: string
      mimeType: string
      sizeBytes: number
    },
  ) {
    if (!ALLOWED_MIME[input.kind]?.includes(input.mimeType))
      throw badRequest('unsupported_format')
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > this.config.maxUploadBytes
    )
      throw badRequest('invalid_size')
    const assetId = newId('ast')
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS)
    await this.db.transaction(async tx => {
      await tx.query(
        `insert into media_assets (id, owner_did, kind, purpose, status, storage_key, mime_type, declared_size_bytes)
         values ($1, $2, $3, $4, 'UPLOADING', $5, $6, $7)`,
        [
          assetId,
          ownerDid,
          input.kind,
          input.purpose,
          `assets/${assetId}/source`,
          input.mimeType,
          input.sizeBytes,
        ],
      )
      await tx.query(
        `insert into upload_sessions (id, asset_id, owner_did, token_hash, expires_at) values ($1, $2, $3, $4, $5)`,
        [newId('ups'), assetId, ownerDid, sha(token), expiresAt],
      )
    })
    return {
      assetId,
      uploadUrl: `/media/upload/${token}`,
      expiresAt: expiresAt.toISOString(),
    }
  }

  /** Streams the body to private storage, enforcing size and real file type. */
  async receiveUpload(token: string, body: Readable, contentLength?: number) {
    const [session] = await this.db.query(
      `update upload_sessions set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now()
        returning asset_id`,
      [sha(token)],
    )
    if (!session) throw notFound()
    const [asset] = await this.db.query(
      `select * from media_assets where id = $1`,
      [session.asset_id],
    )
    const limit = Math.min(
      Number(asset.declared_size_bytes),
      this.config.maxUploadBytes,
    )
    if (contentLength === undefined || contentLength > limit) {
      body.resume() // discard without tearing down the connection
      await this.setStatus(asset.id, 'FAILED', 'too_large')
      throw badRequest('too_large')
    }

    let received = 0
    let exceeded = false
    let head = Buffer.alloc(0)
    const hash = createHash('sha256')
    const guard = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length
        // Over the limit: keep draining the request but stop writing.
        if (received > limit) {
          exceeded = true
          return cb()
        }
        if (head.length < 64)
          head = Buffer.concat([head, chunk]).subarray(0, 64)
        hash.update(chunk)
        cb(null, chunk)
      },
    })
    try {
      await pipeline(
        body,
        guard,
        await this.storage.createWriteStream(asset.storage_key),
      )
      if (exceeded) throw new Error('too_large')
      const sniffed = sniff(head)
      if (
        !sniffed ||
        sniffed.kind !== asset.kind ||
        !ALLOWED_MIME[asset.kind].includes(sniffed.mime)
      )
        throw new Error('content_mismatch')
    } catch (e) {
      await this.storage.removePrefix(`assets/${asset.id}`)
      await this.setStatus(
        asset.id,
        'FAILED',
        e instanceof Error ? e.message : 'upload_failed',
      )
      throw badRequest(
        e instanceof Error && e.message === 'too_large'
          ? 'too_large'
          : 'invalid_file',
      )
    }
    await this.db.query(
      `update media_assets set status = 'QUEUED', size_bytes = $2, sha256 = $3, updated_at = now() where id = $1`,
      [asset.id, received, hash.digest('hex')],
    )
    this.enqueue(asset.id)
    return {assetId: asset.id, status: 'QUEUED' as const}
  }

  // ---------------------------------------------------------------- processing

  enqueue(assetId: string) {
    this.queue = this.queue.then(() => this.process(assetId)).catch(() => {})
  }

  /** Resolves when queued work is done (tests, graceful shutdown). */
  drain() {
    return this.queue
  }

  async process(assetId: string) {
    const [asset] = await this.db.query(
      `update media_assets set status = 'PROCESSING', updated_at = now()
        where id = $1 and status = 'QUEUED' returning *`,
      [assetId],
    )
    if (!asset) return
    const source = this.storage.localPath(asset.storage_key)
    try {
      for (const hook of scanHooks) {
        if (
          (await hook({id: asset.id, kind: asset.kind}, source)) ===
          'quarantine'
        ) {
          await this.finish(asset.id, 'QUARANTINED', 'scan_hook')
          return
        }
      }
      if (asset.kind === 'video') await this.processVideo(asset, source)
      else if (asset.kind === 'image') await this.processImage(asset, source)
      else
        await this.addVariant(
          asset.id,
          'original',
          `assets/${asset.id}`,
          'source',
          asset.mime_type,
        )
      await this.db.query(
        `update media_assets set status = 'READY', updated_at = now() where id = $1 and status = 'PROCESSING'`,
        [asset.id],
      )
    } catch (e) {
      await this.finish(
        asset.id,
        'FAILED',
        e instanceof Error ? e.message.slice(0, 500) : 'processing_failed',
      )
    }
  }

  /**
   * Ends processing without clobbering a moderation decision taken while the
   * worker ran (an asset removed mid-processing stays REMOVED).
   */
  private async finish(assetId: string, status: AssetStatus, error: string) {
    await this.db.query(
      `update media_assets set status = $2, error = $3, updated_at = now()
        where id = $1 and status = 'PROCESSING'`,
      [assetId, status, error],
    )
  }

  private async processVideo(asset: any, source: string) {
    const meta = await probe(source)
    if (!meta.width || !meta.height) throw new Error('no_video_stream')
    await this.db.query(
      `update media_assets set duration_ms = $2, width = $3, height = $4 where id = $1`,
      [asset.id, meta.durationMs, meta.width, meta.height],
    )
    const base = `assets/${asset.id}/hls`
    const master = ['#EXTM3U', '#EXT-X-VERSION:3']
    for (const r of RENDITIONS) {
      const height = Math.min(r.height, meta.height - (meta.height % 2))
      const dir = this.storage.localPath(`${base}/${r.name}`)
      await mkdir(dir, {recursive: true})
      await run([
        '-y',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-vf',
        `scale=-2:${height}`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-f',
        'hls',
        '-hls_time',
        '4',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        `${dir}/seg_%04d.ts`,
        `${dir}/index.m3u8`,
      ])
      const width = Math.round((meta.width * height) / meta.height / 2) * 2
      master.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${width}x${height}`,
        `${r.name}/index.m3u8`,
      )
    }
    const masterPath = this.storage.localPath(`${base}/master.m3u8`)
    await writeFile(masterPath, master.join('\n') + '\n')
    await this.addVariant(
      asset.id,
      'hls',
      base,
      'master.m3u8',
      'application/vnd.apple.mpegurl',
      meta.width,
      meta.height,
    )
  }

  private async processImage(asset: any, source: string) {
    const meta = await probe(source)
    await this.db.query(
      `update media_assets set width = $2, height = $3 where id = $1`,
      [asset.id, meta.width, meta.height],
    )
    const thumbKey = `assets/${asset.id}/thumb/thumb.jpg`
    const thumb = this.storage.localPath(thumbKey)
    await mkdir(dirname(thumb), {recursive: true})
    await run([
      '-y',
      '-i',
      source,
      '-vf',
      "scale='min(720,iw)':-2",
      '-frames:v',
      '1',
      thumb,
    ])
    await this.addVariant(
      asset.id,
      'thumbnail',
      `assets/${asset.id}/thumb`,
      'thumb.jpg',
      'image/jpeg',
    )
    await this.addVariant(
      asset.id,
      'original',
      `assets/${asset.id}`,
      'source',
      asset.mime_type,
      meta.width,
      meta.height,
    )
  }

  private async addVariant(
    assetId: string,
    kind: string,
    prefix: string,
    entry: string,
    mime: string,
    width?: number | null,
    height?: number | null,
  ) {
    await this.db.query(
      `insert into media_variants (id, asset_id, kind, storage_prefix, entry_file, mime_type, width, height)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (asset_id, kind) do nothing`,
      [
        newId('var'),
        assetId,
        kind,
        prefix,
        entry,
        mime,
        width ?? null,
        height ?? null,
      ],
    )
  }

  async setStatus(assetId: string, status: AssetStatus, error?: string) {
    await this.db.query(
      `update media_assets set status = $2, error = coalesce($3, error), updated_at = now() where id = $1`,
      [assetId, status, error ?? null],
    )
  }

  // ---------------------------------------------------------------- playback

  /**
   * Mints a short-lived URL for one variant. Callers MUST have obtained an
   * allowed AccessDecision first; the engine only checks the asset itself.
   */
  async authorize(assetId: string, variantKind: string, entitlementId = '') {
    const [row] = await this.db.query(
      `select a.status, v.entry_file from media_assets a
         join media_variants v on v.asset_id = a.id and v.kind = $2
        where a.id = $1`,
      [assetId, variantKind],
    )
    if (!row || row.status !== 'READY') throw forbidden('media_unavailable')
    const exp = Math.floor(Date.now() / 1000) + this.config.playbackTtlSeconds
    const token = signPlayback(
      {assetId, variant: variantKind, entitlementId, exp},
      this.config.mediaSigningSecret,
    )
    return {
      url: `/stream/${token}/${row.entry_file}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    }
  }

  /** Serves a file under a signed token. Re-checks asset + grant on playlists. */
  async open(token: string, file: string) {
    const claims = verifyPlayback(token, this.config.mediaSigningSecret)
    if (!claims) throw forbidden('invalid_or_expired')
    const [row] = await this.db.query(
      `select a.status, v.storage_prefix, v.mime_type, v.entry_file from media_assets a
         join media_variants v on v.asset_id = a.id and v.kind = $2
        where a.id = $1`,
      [claims.assetId, claims.variant],
    )
    if (!row || row.status !== 'READY') throw forbidden('media_unavailable')
    const isPlaylist = file.endsWith('.m3u8')
    if (isPlaylist && claims.entitlementId) {
      const [grant] = await this.db.query(
        `select 1 from entitlements where id = $1 and revoked_at is null
            and (expires_at is null or expires_at > now())`,
        [claims.entitlementId],
      )
      if (!grant) throw forbidden('entitlement_inactive')
    }
    const key = assertSafeKey(`${row.storage_prefix}/${file}`)
    const size = await this.storage.size(key)
    if (size === undefined) throw notFound()
    const mime = isPlaylist
      ? 'application/vnd.apple.mpegurl'
      : file.endsWith('.ts')
        ? 'video/mp2t'
        : file === row.entry_file
          ? row.mime_type
          : 'application/octet-stream'
    return {
      stream: this.storage.createReadStream(key),
      size,
      mime,
      maxAge: Math.max(0, claims.exp - Math.floor(Date.now() / 1000)),
    }
  }
}

export async function getAsset(db: Queryable, id: string) {
  const [row] = await db.query(`select * from media_assets where id = $1`, [id])
  return row
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      FFMPEG,
      ['-hide_banner', '-loglevel', 'error', ...args],
      {stdio: ['ignore', 'ignore', 'pipe']},
    )
    let err = ''
    child.stderr.on('data', d => (err += d))
    child.on('error', reject)
    child.on('close', code =>
      code === 0 ? resolve(err) : reject(new Error(`ffmpeg_failed`)),
    )
  })
}

/** Reads duration and dimensions from ffmpeg's stream report. */
function probe(file: string): Promise<{
  durationMs: number | null
  width: number | null
  height: number | null
}> {
  return new Promise(resolve => {
    const child = spawn(FFMPEG, ['-hide_banner', '-i', file], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let out = ''
    child.stderr.on('data', d => (out += d))
    child.on('close', () => {
      const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out)
      const v =
        /Stream #[^\n]*(?:Video|video)[^\n]*?, (\d{2,5})x(\d{2,5})/.exec(out)
      resolve({
        durationMs: d
          ? Math.round((+d[1] * 3600 + +d[2] * 60 + +d[3]) * 1000)
          : null,
        width: v ? +v[1] : null,
        height: v ? +v[2] : null,
      })
    })
  })
}
