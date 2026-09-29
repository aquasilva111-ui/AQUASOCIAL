import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {getApprovedCreatorForDid} from '../economy/index.js'
import {
  checkAccess,
  isAgeVerified,
  type ProtectedResource,
  registerResourceResolver,
} from '../entitlements/index.js'
import {badRequest, conflict, forbidden, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {registerRoutes, type RouteContext} from '../registry.js'

const POLICIES = [
  'free',
  'follower_only',
  'subscriber_only',
  'tier_required',
  'ppv_required',
  'purchase_required',
  'rental_required',
] as const

const VIEW_WINDOW_MS = 12 * 3600_000
const HISTORY_THROTTLE_MS = 3600_000

/** A video is unavailable if either the video or its media is pulled. */
export function effectiveStatus(videoStatus: string, mediaStatus: string) {
  if (videoStatus === 'removed' || mediaStatus === 'REMOVED') return 'removed'
  if (videoStatus === 'quarantined' || mediaStatus === 'QUARANTINED')
    return 'quarantined'
  return videoStatus
}

registerResourceResolver(
  'video',
  async (db, id): Promise<ProtectedResource | undefined> => {
    const [v] = await db.query(
      `select v.*, c.did as creator_did, c.status as creator_status, a.status as media_status
       from videos v join creators c on c.id = v.creator_id
       join media_assets a on a.id = v.media_asset_id
      where v.id = $1`,
      [id],
    )
    if (!v) return undefined
    return {
      type: 'video',
      id,
      policy: v.access_policy,
      requiredTierId: v.required_tier_id,
      status: effectiveStatus(
        v.status,
        v.media_status,
      ) as ProtectedResource['status'],
      ownerDids: [v.creator_did],
      creatorSuspended: v.creator_status === 'suspended',
      scopes: [{type: 'creator', id: v.creator_id}],
    }
  },
)

/** Every Views +18 route runs inside a verified adult context. */
export async function requireAdult(
  ctx: RouteContext,
  req: Parameters<RouteContext['user']>[0],
) {
  const did = await ctx.user(req)
  if (!(await isAgeVerified(ctx.db, did)))
    throw forbidden('age_verification_required')
  return did
}

async function ownedAsset(
  db: Queryable,
  did: string,
  id: string | undefined,
  kind: string,
) {
  if (!id) return undefined
  const [a] = await db.query(
    `select * from media_assets where id = $1 and owner_did = $2`,
    [id, did],
  )
  if (!a || a.kind !== kind) throw badRequest('invalid_asset')
  return a
}

/**
 * Records watch progress, private history and a counted view. Views count
 * once per user per item per 12h window, and only after meaningful watch
 * time — never per HLS segment request.
 */
export async function recordWatch(
  db: Queryable,
  userDid: string,
  resource: {type: string; id: string},
  positionMs: number,
  durationMs: number | null,
  onCounted: () => Promise<void>,
  now = new Date(),
) {
  await db.query(
    `insert into adult_watch_progress (user_did, resource_type, resource_id, position_ms, duration_ms, updated_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_did, resource_type, resource_id)
     do update set position_ms = excluded.position_ms,
                   duration_ms = coalesce(excluded.duration_ms, adult_watch_progress.duration_ms),
                   updated_at = excluded.updated_at`,
    [userDid, resource.type, resource.id, positionMs, durationMs, now],
  )
  const [recent] = await db.query(
    `select 1 from adult_watch_history where user_did = $1 and resource_type = $2 and resource_id = $3 and watched_at > $4`,
    [
      userDid,
      resource.type,
      resource.id,
      new Date(now.getTime() - HISTORY_THROTTLE_MS),
    ],
  )
  if (!recent)
    await db.query(
      `insert into adult_watch_history (id, user_did, resource_type, resource_id, watched_at) values ($1, $2, $3, $4, $5)`,
      [newId('wh'), userDid, resource.type, resource.id, now],
    )
  const threshold = Math.min(30_000, durationMs ? durationMs / 2 : 30_000)
  if (positionMs >= threshold) {
    const windowStart = new Date(
      Math.floor(now.getTime() / VIEW_WINDOW_MS) * VIEW_WINDOW_MS,
    )
    const counted = await db.query(
      `insert into view_events (user_did, resource_type, resource_id, window_start)
       values ($1, $2, $3, $4) on conflict do nothing returning 1`,
      [userDid, resource.type, resource.id, windowStart],
    )
    if (counted.length) await onCounted()
  }
}

registerRoutes(ctx => {
  const {app, db, media} = ctx

  const card = async (v: any) => ({
    id: v.id,
    title: v.title,
    description: v.description,
    category: v.category,
    creator: {id: v.creator_id, handle: v.creator_handle},
    durationMs: v.duration_ms,
    accessPolicy: v.access_policy,
    viewCount: String(v.view_count),
    publishedAt: v.published_at,
    hasPreview: !!v.preview_asset_id,
    posterUrl: v.poster_asset_id
      ? await media.authorize(v.poster_asset_id, 'thumbnail').then(
          r => r.url,
          () => null,
        )
      : null,
  })

  const listSql = `select v.*, c.handle as creator_handle, a.duration_ms
      from videos v join creators c on c.id = v.creator_id
      join media_assets a on a.id = v.media_asset_id
     where v.status = 'published' and a.status = 'READY' and c.status = 'approved'`

  // ------------------------------------------------------------ creator
  app.post('/creator/videos', async req => {
    const did = await ctx.user(req)
    const creator = await getApprovedCreatorForDid(db, did)
    const body = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        category: z.string().max(40).optional(),
        mediaAssetId: z.string(),
        previewAssetId: z.string().optional(),
        posterAssetId: z.string().optional(),
        // Required: a failed/missing policy can never default to free.
        accessPolicy: z.enum(POLICIES),
        requiredTierId: z.string().optional(),
        publish: z.boolean().default(false),
      })
      .parse(req.body)
    const main = await ownedAsset(db, did, body.mediaAssetId, 'video')
    await ownedAsset(db, did, body.previewAssetId, 'video')
    await ownedAsset(db, did, body.posterAssetId, 'image')
    if (body.accessPolicy === 'tier_required') {
      const [tier] = await db.query(
        `select 1 from subscription_tiers where id = $1 and owner_type = 'creator' and owner_id = $2`,
        [body.requiredTierId, creator.id],
      )
      if (!tier) throw badRequest('invalid_tier')
    }
    if (body.publish && main?.status !== 'READY')
      throw conflict('media_not_ready')
    const id = newId('vid')
    await db.query(
      `insert into videos (id, creator_id, media_asset_id, preview_asset_id, poster_asset_id, title, description,
                           category, access_policy, required_tier_id, status, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        creator.id,
        body.mediaAssetId,
        body.previewAssetId ?? null,
        body.posterAssetId ?? null,
        body.title,
        body.description ?? null,
        body.category ?? null,
        body.accessPolicy,
        body.requiredTierId ?? null,
        body.publish ? 'published' : 'draft',
        body.publish ? new Date() : null,
      ],
    )
    return {videoId: id}
  })

  app.patch('/creator/videos/:id', async req => {
    const did = await ctx.user(req)
    const creator = await getApprovedCreatorForDid(db, did)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        accessPolicy: z.enum(POLICIES).optional(),
        status: z.enum(['draft', 'published']).optional(),
      })
      .parse(req.body)
    const [v] = await db.query(
      `select v.*, a.status as media_status from videos v join media_assets a on a.id = v.media_asset_id
        where v.id = $1 and v.creator_id = $2`,
      [id, creator.id],
    )
    if (!v) throw notFound()
    // Moderation states are not the creator's to lift.
    if (v.status === 'quarantined' || v.status === 'removed')
      throw forbidden('under_moderation')
    if (body.status === 'published' && v.media_status !== 'READY')
      throw conflict('media_not_ready')
    await db.query(
      `update videos set title = coalesce($2, title), description = coalesce($3, description),
         access_policy = coalesce($4, access_policy), status = coalesce($5, status),
         published_at = case when $5 = 'published' and published_at is null then now() else published_at end
       where id = $1`,
      [
        id,
        body.title ?? null,
        body.description ?? null,
        body.accessPolicy ?? null,
        body.status ?? null,
      ],
    )
    return {ok: true}
  })

  // ------------------------------------------------------------ discovery
  app.get('/views/feed', async req => {
    const did = await requireAdult(ctx, req)
    const q = z
      .object({
        section: z
          .enum(['recent', 'subscriptions', 'purchased', 'continue', 'creator'])
          .default('recent'),
        creatorId: z.string().optional(),
        category: z.string().max(40).optional(),
      })
      .parse(req.query)
    let rows: any[]
    switch (q.section) {
      case 'subscriptions':
        rows = await db.query(
          `${listSql} and v.creator_id in (
             select target_id from subscriptions where subscriber_did = $1 and target_type = 'creator'
                and status in ('ACTIVE', 'PAST_DUE', 'CANCELLED') and current_period_end > now())
           order by v.published_at desc limit 60`,
          [did],
        )
        break
      case 'purchased':
        rows = await db.query(
          `${listSql} and v.id in (
             select resource_id from entitlements where user_did = $1 and resource_type = 'video'
                and revoked_at is null and (expires_at is null or expires_at > now()))
           order by v.published_at desc limit 60`,
          [did],
        )
        break
      case 'continue':
        rows = await db.query(
          `${listSql} and v.id in (
             select resource_id from adult_watch_progress p where user_did = $1 and resource_type = 'video'
                and (p.duration_ms is null or p.position_ms < p.duration_ms * 0.95))
           order by v.published_at desc limit 30`,
          [did],
        )
        break
      case 'creator':
        rows = await db.query(
          `${listSql} and v.creator_id = $1 order by v.published_at desc limit 60`,
          [q.creatorId ?? ''],
        )
        break
      default:
        rows = q.category
          ? await db.query(
              `${listSql} and v.category = $1 order by v.published_at desc limit 60`,
              [q.category],
            )
          : await db.query(`${listSql} order by v.published_at desc limit 60`)
    }
    return {videos: await Promise.all(rows.map(card))}
  })

  app.get('/views/videos/:id', async req => {
    const did = await requireAdult(ctx, req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {decision, resource} = await checkAccess(db, did, {type: 'video', id})
    if (
      !resource ||
      (resource.status !== 'published' && !resource.ownerDids.includes(did))
    )
      throw notFound()
    const [v] = await db.query(
      `select v.*, c.handle as creator_handle, a.duration_ms from videos v
         join creators c on c.id = v.creator_id join media_assets a on a.id = v.media_asset_id where v.id = $1`,
      [id],
    )
    const offers = await db.query(
      `select id, kind, price_minor, currency, access_hours from offers
        where resource_type = 'video' and resource_id = $1 and active order by price_minor`,
      [id],
    )
    const [progress] = await db.query(
      `select position_ms, duration_ms from adult_watch_progress where user_did = $1 and resource_type = 'video' and resource_id = $2`,
      [did, id],
    )
    return {
      video: await card(v),
      access: decision,
      offers: offers.map(o => ({
        id: o.id,
        kind: o.kind,
        priceMinor: String(o.price_minor),
        currency: o.currency,
        accessHours: o.access_hours,
      })),
      progress: progress
        ? {positionMs: progress.position_ms, durationMs: progress.duration_ms}
        : null,
    }
  })

  app.get('/views/videos/:id/related', async req => {
    await requireAdult(ctx, req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const [v] = await db.query(
      `select creator_id, category from videos where id = $1 and status = 'published'`,
      [id],
    )
    if (!v) throw notFound()
    // Adult-only signals: same creator, same category. Nothing social.
    const rows = await db.query(
      `${listSql} and v.id <> $1 and (v.creator_id = $2 or v.category = $3)
       order by (v.creator_id = $2) desc, v.published_at desc limit 12`,
      [id, v.creator_id, v.category],
    )
    return {videos: await Promise.all(rows.map(card))}
  })

  // ------------------------------------------------------------ playback
  app.post('/views/videos/:id/playback', async req => {
    const did = await requireAdult(ctx, req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {decision} = await checkAccess(db, did, {type: 'video', id})
    if (!decision.allowed) throw forbidden(decision.reason)
    const [v] = await db.query(
      `select media_asset_id from videos where id = $1`,
      [id],
    )
    const entitlementId =
      decision.via === 'grant' ? (decision.entitlementId ?? '') : ''
    return media.authorize(v.media_asset_id, 'hls', entitlementId)
  })

  /** Previews are their own assets. The full video is never "limited in JS". */
  app.post('/views/videos/:id/preview', async req => {
    await requireAdult(ctx, req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const [v] = await db.query(
      `select v.preview_asset_id, v.status, a.status as media_status from videos v
         join media_assets a on a.id = v.media_asset_id where v.id = $1`,
      [id],
    )
    if (
      !v ||
      effectiveStatus(v.status, v.media_status) !== 'published' ||
      !v.preview_asset_id
    )
      throw notFound()
    return media.authorize(v.preview_asset_id, 'hls')
  })

  app.post('/views/videos/:id/progress', async req => {
    const did = await requireAdult(ctx, req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        positionMs: z.number().int().min(0),
        durationMs: z.number().int().positive().optional(),
      })
      .parse(req.body)
    const {decision} = await checkAccess(db, did, {type: 'video', id})
    if (!decision.allowed) throw forbidden(decision.reason)
    await recordWatch(
      db,
      did,
      {type: 'video', id},
      body.positionMs,
      body.durationMs ?? null,
      async () => {
        await db.query(
          `update videos set view_count = view_count + 1 where id = $1`,
          [id],
        )
      },
    )
    return {ok: true}
  })

  // ------------------------------------------------------------ private history
  app.get('/me/adult/history', async req => {
    const did = await requireAdult(ctx, req)
    const rows = await db.query(
      `select id, resource_type, resource_id, watched_at from adult_watch_history
        where user_did = $1 order by watched_at desc limit 200`,
      [did],
    )
    return {history: rows}
  })

  app.delete('/me/adult/history/:id', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await db.query(
      `delete from adult_watch_history where id = $1 and user_did = $2`,
      [id, did],
    )
    return {ok: true}
  })

  /** Clears viewing history + progress only. Orders, ledger and audit stay. */
  app.delete('/me/adult/history', async req => {
    const did = await ctx.user(req)
    await db.query(`delete from adult_watch_history where user_did = $1`, [did])
    await db.query(`delete from adult_watch_progress where user_did = $1`, [
      did,
    ])
    return {ok: true}
  })
})
