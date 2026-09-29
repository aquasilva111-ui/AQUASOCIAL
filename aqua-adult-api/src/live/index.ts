import {createHash, randomBytes} from 'node:crypto'
import {readFile, writeFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {
  checkAccess,
  isAgeVerified,
  type ProtectedResource,
  registerResourceResolver,
} from '../entitlements/index.js'
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {signPlayback, verifyPlayback} from '../media/signing.js'
import {assertSafeKey} from '../media/storage.js'
import {registerRoutes} from '../registry.js'
import {studioRole} from '../studios/index.js'

export type LiveStatus =
  | 'SCHEDULED'
  | 'STARTING'
  | 'LIVE'
  | 'ENDED'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'QUARANTINED'
  | 'REMOVED'

const INTERRUPT_AFTER_MS = 20_000
const VIEWER_WINDOW_MS = 30_000
const MAX_INGEST_FILE_BYTES = 64 * 1024 * 1024
const INGEST_FILE_RE = /^[a-zA-Z0-9_-]{1,64}\.(m3u8|ts|m4s|mp4)$/
const REPORT_REASONS = [
  'underage_suspected',
  'non_consensual',
  'illegal_content',
  'harassment',
  'spam',
  'impersonation',
  'copyright',
  'other',
] as const

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex')
const newStreamKey = () => `lk_${randomBytes(24).toString('base64url')}`
const prefix = (id: string) => `live/${id}`

/** Maps live lifecycle onto the Entitlements status vocabulary. */
function resourceStatus(status: LiveStatus): ProtectedResource['status'] {
  switch (status) {
    case 'LIVE':
    case 'STARTING':
    case 'INTERRUPTED':
      return 'published'
    case 'SCHEDULED':
      return 'scheduled'
    case 'QUARANTINED':
      return 'quarantined'
    case 'REMOVED':
      return 'removed'
    default:
      return 'unavailable'
  }
}

async function ownerDids(db: Queryable, s: any): Promise<string[]> {
  if (s.creator_id) {
    const [c] = await db.query(`select did from creators where id = $1`, [
      s.creator_id,
    ])
    return c ? [c.did] : []
  }
  const rows = await db.query(
    `select member_did from studio_members where studio_id = $1 and role in ('OWNER', 'ADMIN', 'EDITOR')`,
    [s.studio_id],
  )
  return rows.map(r => r.member_did)
}

/** A LIVE stream whose segments stopped arriving becomes INTERRUPTED. */
async function refresh(db: Queryable, s: any, now = new Date()) {
  if (
    s.status === 'LIVE' &&
    s.last_segment_at &&
    now.getTime() - new Date(s.last_segment_at).getTime() > INTERRUPT_AFTER_MS
  ) {
    await db.query(
      `update live_streams set status = 'INTERRUPTED' where id = $1 and status = 'LIVE'`,
      [s.id],
    )
    return {...s, status: 'INTERRUPTED'}
  }
  return s
}

registerResourceResolver('live', async (db, id) => {
  const [s] = await db.query(
    `select l.*, c.status as creator_status, st.verification_status as studio_status
       from live_streams l left join creators c on c.id = l.creator_id left join studios st on st.id = l.studio_id
      where l.id = $1`,
    [id],
  )
  if (!s) return undefined
  const current = await refresh(db, s)
  return {
    type: 'live',
    id,
    policy: s.access_policy,
    requiredTierId: s.required_tier_id,
    status: resourceStatus(current.status),
    ownerDids: await ownerDids(db, s),
    creatorSuspended:
      s.creator_status === 'suspended' || s.studio_status === 'suspended',
    scopes: [
      s.creator_id
        ? {type: 'creator', id: s.creator_id}
        : {type: 'studio', id: s.studio_id},
    ],
  }
})

async function isBlocked(db: Queryable, streamId: string, did: string) {
  const [b] = await db.query(
    `select 1 from live_bans where stream_id = $1 and user_did = $2 and kind = 'block'
        and (until is null or until > now())`,
    [streamId, did],
  )
  return !!b
}

async function isMuted(db: Queryable, streamId: string, did: string) {
  const [b] = await db.query(
    `select 1 from live_bans where stream_id = $1 and user_did = $2 and kind in ('mute', 'block')
        and (until is null or until > now())`,
    [streamId, did],
  )
  return !!b
}

async function viewerCount(db: Queryable, streamId: string) {
  const [row] = await db.query(
    `select count(*)::int as n from live_viewer_sessions where stream_id = $1 and last_seen > $2`,
    [streamId, new Date(Date.now() - VIEWER_WINDOW_MS)],
  )
  return row.n as number
}

/**
 * Buffers an ingest body up to `limit` bytes (live segments are small).
 * Past the limit it keeps draining without storing, so the connection is
 * never torn down mid-request.
 */
function readLimited(stream: Readable, limit: number) {
  return new Promise<{data: Buffer; tooBig: boolean; complete: boolean}>(
    resolve => {
      const chunks: Buffer[] = []
      let size = 0
      let tooBig = false
      let done = false
      const finish = (complete: boolean) => {
        if (done) return
        done = true
        resolve({data: Buffer.concat(chunks), tooBig, complete})
      }
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > limit) tooBig = true
        else chunks.push(chunk)
      })
      stream.on('end', () => finish(true))
      stream.on('aborted', () => finish(false))
      stream.on('error', () => finish(false))
      stream.on('close', () => finish(false))
    },
  )
}

/** Control, zero-width and bidi-override characters (spoofing vectors). */
const CONTROL_CHARS = new RegExp(
  '[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2066-\\u2069]',
  'g',
)

/** Strips control characters; chat is plain text only. */
function cleanChat(body: string) {
  return body.replace(CONTROL_CHARS, '').trim()
}

registerRoutes(ctx => {
  const {app, db, media, config} = ctx

  const requireAdult = async (req: Parameters<typeof ctx.user>[0]) => {
    const did = await ctx.user(req)
    if (!(await isAgeVerified(db, did)))
      throw forbidden('age_verification_required')
    return did
  }

  async function loadStream(id: string) {
    const [s] = await db.query(`select * from live_streams where id = $1`, [id])
    if (!s) throw notFound()
    return refresh(db, s)
  }

  async function requireOwner(did: string, id: string) {
    const s = await loadStream(id)
    if (!(await ownerDids(db, s)).includes(did)) throw forbidden('not_owner')
    return s
  }

  async function requireModerator(did: string, id: string) {
    const s = await loadStream(id)
    if ((await ownerDids(db, s)).includes(did)) return s
    const [m] = await db.query(
      `select 1 from live_chat_moderators where stream_id = $1 and moderator_did = $2`,
      [id, did],
    )
    if (!m) throw forbidden('not_moderator')
    return s
  }

  /** Viewer-side gate: Entitlements decision + channel block. */
  async function requireViewer(did: string, id: string) {
    const {decision} = await checkAccess(db, did, {type: 'live', id})
    if (!decision.allowed) throw forbidden(decision.reason)
    if (await isBlocked(db, id, did)) throw forbidden('blocked')
    return decision
  }

  // ------------------------------------------------------------ creator setup
  app.post('/live', async req => {
    const did = await requireAdult(req)
    const body = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        accessPolicy: z.enum([
          'free',
          'follower_only',
          'subscriber_only',
          'tier_required',
          'ppv_required',
        ]),
        requiredTierId: z.string().optional(),
        scheduledAt: z.string().datetime().optional(),
        studioId: z.string().optional(),
      })
      .parse(req.body)
    let creatorId: string | null = null
    if (body.studioId) {
      const role = await studioRole(db, body.studioId, did)
      if (
        !role ||
        role.verification_status !== 'verified' ||
        !['OWNER', 'ADMIN', 'EDITOR'].includes(role.role)
      )
        throw forbidden('not_owner')
    } else {
      const [c] = await db.query(
        `select id from creators where did = $1 and status = 'approved'`,
        [did],
      )
      if (!c) throw forbidden('creator_not_approved')
      creatorId = c.id
    }
    const key = newStreamKey()
    const id = newId('live')
    await db.query(
      `insert into live_streams (id, creator_id, studio_id, title, description, access_policy, required_tier_id,
                                 scheduled_at, stream_key_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        creatorId,
        body.studioId ?? null,
        body.title,
        body.description ?? null,
        body.accessPolicy,
        body.requiredTierId ?? null,
        body.scheduledAt ?? null,
        hashKey(key),
      ],
    )
    // The key is returned exactly once and is never logged or shown again.
    return {
      streamId: id,
      streamKey: key,
      ingestUrl: `/live/ingest/${key}/index.m3u8`,
    }
  })

  app.post('/live/:id/rotate-key', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await requireOwner(did, id)
    const key = newStreamKey()
    await db.query(
      `update live_streams set stream_key_hash = $2, stream_key_rotated_at = now() where id = $1`,
      [id, hashKey(key)],
    )
    return {streamKey: key, ingestUrl: `/live/ingest/${key}/index.m3u8`}
  })

  app.post('/live/:id/start', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const s = await requireOwner(did, id)
    if (!['SCHEDULED', 'INTERRUPTED'].includes(s.status))
      throw conflict('invalid_state')
    await db.query(
      `update live_streams set status = 'STARTING' where id = $1`,
      [id],
    )
    return {status: 'STARTING'}
  })

  app.post('/live/:id/cancel', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const s = await requireOwner(did, id)
    if (!['SCHEDULED', 'STARTING'].includes(s.status))
      throw conflict('invalid_state')
    await db.query(
      `update live_streams set status = 'CANCELLED', ended_at = now() where id = $1`,
      [id],
    )
    return {status: 'CANCELLED'}
  })

  /**
   * Ends the stream. Optionally keeps the recording as a MediaAsset that
   * reuses the ingested HLS segments (no re-processing), ready to become a
   * Views +18 video or studio content. Chat and viewer sessions are purged.
   */
  app.post('/live/:id/end', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({record: z.boolean().default(false)})
      .parse(req.body ?? {})
    const s = await requireOwner(did, id)
    if (!['STARTING', 'LIVE', 'INTERRUPTED'].includes(s.status))
      throw conflict('invalid_state')
    let recordingAssetId: string | null = null
    if (body.record && s.last_segment_at) {
      const playlistPath = media.storage.localPath(`${prefix(id)}/index.m3u8`)
      const live = await readFile(playlistPath, 'utf8').catch(() => '')
      if (live.includes('#EXTINF')) {
        let vod = live.replace(
          '#EXT-X-PLAYLIST-TYPE:EVENT',
          '#EXT-X-PLAYLIST-TYPE:VOD',
        )
        if (!vod.includes('#EXT-X-PLAYLIST-TYPE'))
          vod = vod.replace('#EXTM3U', '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD')
        if (!vod.includes('#EXT-X-ENDLIST'))
          vod = `${vod.trimEnd()}\n#EXT-X-ENDLIST\n`
        await writeFile(
          media.storage.localPath(`${prefix(id)}/recording.m3u8`),
          vod,
        )
        recordingAssetId = newId('ast')
        await db.transaction(async tx => {
          await tx.query(
            `insert into media_assets (id, owner_did, kind, purpose, status, storage_key, mime_type, declared_size_bytes)
             values ($1, $2, 'video', 'original', 'READY', $3, 'application/vnd.apple.mpegurl', 1)`,
            [recordingAssetId, did, `${prefix(id)}/recording.m3u8`],
          )
          await tx.query(
            `insert into media_variants (id, asset_id, kind, storage_prefix, entry_file, mime_type)
             values ($1, $2, 'hls', $3, 'recording.m3u8', 'application/vnd.apple.mpegurl')`,
            [newId('var'), recordingAssetId, prefix(id)],
          )
        })
      }
    }
    await db.query(
      `update live_streams set status = 'ENDED', ended_at = now(), recording_asset_id = $2 where id = $1`,
      [id, recordingAssetId],
    )
    await db.query(`delete from live_chat_messages where stream_id = $1`, [id])
    await db.query(`delete from live_viewer_sessions where stream_id = $1`, [
      id,
    ])
    return {status: 'ENDED', recordingAssetId}
  })

  // ------------------------------------------------------------ ingest
  /**
   * Broadcast ingest: the encoder PUTs HLS playlist/segments with the
   * stream key (e.g. `ffmpeg ... -f hls -method PUT <ingestUrl>`). The key
   * authenticates; it is compared by hash and never logged.
   */
  app.put('/live/ingest/:key/:file', async req => {
    const {key, file} = z
      .object({key: z.string().min(10).max(100), file: z.string()})
      .parse(req.params)
    const body = ((req.body as Readable | undefined) ?? req.raw) as Readable
    // Start reading right away: encoders close the connection as soon as
    // they finish sending, and a paused request would be seen as aborted.
    const received = readLimited(body, MAX_INGEST_FILE_BYTES)
    const [s] = await db.query(
      `select l.*, c.status as creator_status, st.verification_status as studio_status
         from live_streams l left join creators c on c.id = l.creator_id left join studios st on st.id = l.studio_id
        where l.stream_key_hash = $1`,
      [hashKey(key)],
    )
    if (!s) throw forbidden('invalid_stream_key')
    if (!['STARTING', 'LIVE', 'INTERRUPTED'].includes(s.status))
      throw conflict('not_accepting_ingest')
    if (s.creator_status === 'suspended' || s.studio_status === 'suspended')
      throw forbidden('suspended')
    if (!INGEST_FILE_RE.test(file)) throw badRequest('invalid_file_name')

    const {data, tooBig, complete} = await received
    if (tooBig) throw badRequest('too_large')
    if (!complete) throw badRequest('incomplete_upload')
    const storageKey = assertSafeKey(`${prefix(s.id)}/${file}`)
    await pipeline(
      Readable.from([data]),
      await media.storage.createWriteStream(storageKey, {overwrite: true}),
    )
    if (!file.endsWith('.m3u8')) {
      await db.query(
        `update live_streams set last_segment_at = now(), started_at = coalesce(started_at, now()),
           status = case when status in ('STARTING', 'INTERRUPTED') then 'LIVE' else status end
         where id = $1`,
        [s.id],
      )
    }
    return {ok: true}
  })

  // ------------------------------------------------------------ viewers
  app.get('/live', async req => {
    const did = await requireAdult(req)
    const rows = await db.query(
      `select l.id, l.title, l.status, l.access_policy, l.scheduled_at, l.started_at, l.last_segment_at,
              c.handle as creator_handle, st.name as studio_name
         from live_streams l left join creators c on c.id = l.creator_id left join studios st on st.id = l.studio_id
        where l.status in ('SCHEDULED', 'STARTING', 'LIVE', 'INTERRUPTED')
          and (c.status = 'approved' or st.verification_status = 'verified')
          and not exists (select 1 from live_bans b where b.stream_id = l.id and b.user_did = $1
                           and b.kind = 'block' and (b.until is null or b.until > now()))
        order by l.started_at desc nulls last, l.scheduled_at asc nulls last limit 100`,
      [did],
    )
    const streams = await Promise.all(
      rows.map(async r => {
        const current = await refresh(db, r)
        return {
          id: r.id,
          title: r.title,
          status: current.status,
          accessPolicy: r.access_policy,
          scheduledAt: r.scheduled_at,
          startedAt: r.started_at,
          host: r.creator_handle ? `@${r.creator_handle}` : r.studio_name,
          viewerCount: await viewerCount(db, r.id),
        }
      }),
    )
    return {
      live: streams.filter(
        s => s.status === 'LIVE' || s.status === 'INTERRUPTED',
      ),
      upcoming: streams.filter(
        s => s.status === 'SCHEDULED' || s.status === 'STARTING',
      ),
    }
  })

  app.get('/live/:id', async req => {
    const did = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const s = await loadStream(id)
    const {decision, resource} = await checkAccess(db, did, {type: 'live', id})
    const owner = !!resource?.ownerDids.includes(did)
    if (
      !owner &&
      (['QUARANTINED', 'REMOVED'].includes(s.status) ||
        (await isBlocked(db, id, did)))
    )
      throw notFound()
    const offers = await db.query(
      `select id, kind, price_minor, currency, access_hours from offers
        where resource_type = 'live' and resource_id = $1 and active`,
      [id],
    )
    return {
      stream: {
        id,
        title: s.title,
        description: s.description,
        status: s.status,
        accessPolicy: s.access_policy,
        scheduledAt: s.scheduled_at,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        chatEnabled: s.chat_enabled,
        slowModeSeconds: s.slow_mode_seconds,
      },
      access: decision,
      isOwner: owner,
      viewerCount: await viewerCount(db, id),
      offers: offers.map(o => ({
        id: o.id,
        kind: o.kind,
        priceMinor: String(o.price_minor),
        currency: o.currency,
        accessHours: o.access_hours,
      })),
    }
  })

  app.post('/live/:id/playback', async req => {
    const did = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const decision = await requireViewer(did, id)
    const s = await loadStream(id)
    if (
      !['LIVE', 'INTERRUPTED'].includes(s.status) ||
      !(await media.storage.size(`${prefix(id)}/index.m3u8`))
    )
      throw conflict('not_live')
    const exp = Math.floor(Date.now() / 1000) + config.playbackTtlSeconds
    const token = signPlayback(
      {
        assetId: `live:${id}`,
        variant: 'live',
        entitlementId:
          decision.via === 'grant' ? (decision.entitlementId ?? '') : '',
        exp,
        sub: did,
      },
      config.mediaSigningSecret,
    )
    return {
      url: `/live-stream/${token}/index.m3u8`,
      expiresAt: new Date(exp * 1000).toISOString(),
    }
  })

  /** Live delivery. Playlists re-check stream state, grant and channel bans. */
  app.get('/live-stream/:token/:file', async (req, reply) => {
    const {token, file} = z
      .object({token: z.string(), file: z.string()})
      .parse(req.params)
    const claims = verifyPlayback(token, config.mediaSigningSecret)
    if (
      !claims ||
      claims.variant !== 'live' ||
      !claims.assetId.startsWith('live:')
    )
      throw forbidden('invalid_or_expired')
    if (!INGEST_FILE_RE.test(file)) throw notFound()
    const id = claims.assetId.slice('live:'.length)
    const s = await loadStream(id)
    if (!['LIVE', 'INTERRUPTED'].includes(s.status))
      throw forbidden('stream_unavailable')
    const isPlaylist = file.endsWith('.m3u8')
    if (isPlaylist) {
      if (claims.sub && (await isBlocked(db, id, claims.sub)))
        throw forbidden('blocked')
      if (claims.entitlementId) {
        const [grant] = await db.query(
          `select 1 from entitlements where id = $1 and revoked_at is null and (expires_at is null or expires_at > now())`,
          [claims.entitlementId],
        )
        if (!grant) throw forbidden('entitlement_inactive')
      }
    }
    const key = assertSafeKey(`${prefix(id)}/${file}`)
    const size = await media.storage.size(key)
    if (size === undefined) throw notFound()
    reply
      .header(
        'cache-control',
        isPlaylist ? 'private, no-store' : 'private, max-age=30',
      )
      .header('content-length', size)
      .type(
        isPlaylist
          ? 'application/vnd.apple.mpegurl'
          : file.endsWith('.ts')
            ? 'video/mp2t'
            : 'video/mp4',
      )
    return reply.send(media.storage.createReadStream(key))
  })

  /** One heartbeat per authorized viewer; tabs of the same user count once. */
  app.post('/live/:id/heartbeat', async req => {
    const did = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await requireViewer(did, id)
    await db.query(
      `insert into live_viewer_sessions (stream_id, user_did, last_seen) values ($1, $2, now())
       on conflict (stream_id, user_did) do update set last_seen = now()`,
      [id, did],
    )
    const n = await viewerCount(db, id)
    await db.query(
      `update live_streams set peak_viewers = greatest(peak_viewers, $2) where id = $1`,
      [id, n],
    )
    return {viewerCount: n}
  })

  // ------------------------------------------------------------ chat
  app.get('/live/:id/chat', async req => {
    const did = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {after} = z
      .object({after: z.string().datetime().optional()})
      .parse(req.query)
    await requireViewer(did, id)
    const rows = await db.query(
      `select id, author_did, body, created_at from live_chat_messages
        where stream_id = $1 and deleted_at is null and ($2::timestamptz is null or created_at > $2)
        order by created_at desc limit 100`,
      [id, after ?? null],
    )
    return {messages: rows.reverse()}
  })

  app.post('/live/:id/chat', async req => {
    const did = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {body} = z.object({body: z.string().max(2000)}).parse(req.body)
    await requireViewer(did, id)
    const s = await loadStream(id)
    if (
      !s.chat_enabled ||
      !['LIVE', 'INTERRUPTED', 'STARTING'].includes(s.status)
    )
      throw conflict('chat_closed')
    if (await isMuted(db, id, did)) throw forbidden('muted')
    const text = cleanChat(body)
    if (!text || text.length > 500) throw badRequest('invalid_message')
    const isStaff = (await ownerDids(db, s)).includes(did)
    if (s.slow_mode_seconds > 0 && !isStaff) {
      const [recent] = await db.query(
        `select 1 from live_chat_messages where stream_id = $1 and author_did = $2 and created_at > $3`,
        [id, did, new Date(Date.now() - s.slow_mode_seconds * 1000)],
      )
      if (recent) throw new ApiError(429, 'slow_mode')
    }
    const messageId = newId('msg')
    await db.query(
      `insert into live_chat_messages (id, stream_id, author_did, body) values ($1, $2, $3, $4)`,
      [messageId, id, did, text],
    )
    return {id: messageId}
  })

  app.delete('/live/:id/chat/:messageId', async req => {
    const did = await ctx.user(req)
    const {id, messageId} = z
      .object({id: z.string(), messageId: z.string()})
      .parse(req.params)
    await requireModerator(did, id)
    await db.query(
      `update live_chat_messages set deleted_at = now() where id = $1 and stream_id = $2`,
      [messageId, id],
    )
    return {ok: true}
  })

  app.post('/live/:id/moderators', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({did: z.string().regex(/^did:(plc|web):/)})
      .parse(req.body)
    await requireOwner(did, id)
    await db.query(
      `insert into live_chat_moderators (stream_id, moderator_did) values ($1, $2) on conflict do nothing`,
      [id, body.did],
    )
    return {ok: true}
  })

  app.post('/live/:id/bans', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        did: z.string().regex(/^did:(plc|web):/),
        kind: z.enum(['mute', 'block']),
        minutes: z
          .number()
          .int()
          .positive()
          .max(60 * 24 * 365)
          .optional(),
      })
      .parse(req.body)
    const s = await requireModerator(did, id)
    if ((await ownerDids(db, s)).includes(body.did))
      throw forbidden('cannot_ban_owner')
    await db.query(
      `insert into live_bans (stream_id, user_did, kind, until, created_by) values ($1, $2, $3, $4, $5)
       on conflict (stream_id, user_did, kind) do update set until = excluded.until, created_by = excluded.created_by`,
      [
        id,
        body.did,
        body.kind,
        body.minutes ? new Date(Date.now() + body.minutes * 60_000) : null,
        did,
      ],
    )
    if (body.kind === 'block')
      await db.query(
        `delete from live_viewer_sessions where stream_id = $1 and user_did = $2`,
        [id, body.did],
      )
    return {ok: true}
  })

  app.patch('/live/:id/chat-settings', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        chatEnabled: z.boolean().optional(),
        slowModeSeconds: z.number().int().min(0).max(600).optional(),
      })
      .parse(req.body)
    await requireModerator(did, id)
    await db.query(
      `update live_streams set chat_enabled = coalesce($2, chat_enabled), slow_mode_seconds = coalesce($3, slow_mode_seconds) where id = $1`,
      [id, body.chatEnabled ?? null, body.slowModeSeconds ?? null],
    )
    return {ok: true}
  })

  app.post('/live/:id/report', async req => {
    const did = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        reason: z.enum(REPORT_REASONS),
        details: z.string().max(1000).optional(),
      })
      .parse(req.body)
    await loadStream(id)
    const [recent] = await db.query(
      `select 1 from live_reports where stream_id = $1 and reporter_did = $2 and created_at > now() - interval '1 hour'`,
      [id, did],
    )
    if (recent) throw new ApiError(429, 'already_reported')
    await db.query(
      `insert into live_reports (id, stream_id, reporter_did, reason, details) values ($1, $2, $3, $4, $5)`,
      [newId('rep'), id, did, body.reason, body.details ?? null],
    )
    return {ok: true}
  })
})
