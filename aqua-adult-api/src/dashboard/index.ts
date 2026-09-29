import {type FastifyRequest} from 'fastify'
import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {
  assertSeller,
  getApprovedCreatorForDid,
  ledgerSummary,
  type SellerType,
} from '../economy/index.js'
import {isAgeVerified} from '../entitlements/index.js'
import {audit} from '../lib/audit.js'
import {badRequest, conflict, forbidden, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {assertCurrency, assertPrice, parseMinor} from '../lib/money.js'
import {registerRoutes} from '../registry.js'
import {
  PERMISSIONS,
  permissionsFor,
  type StudioPermission,
  type StudioRole,
  studioRole,
} from '../studios/index.js'
import {createCreatorVideo, videoBody} from '../views/index.js'

/**
 * FASE 13 — Creator & Studio Dashboard.
 *
 * Every route resolves the seller on the server and checks the capability it
 * needs: hidden or disabled buttons in the app are cosmetic only. Numbers
 * come from the database (the revenue ledger for money) and are aggregates —
 * no per-viewer rows ever leave these endpoints. With no data, zeros.
 */

type Seller = {
  type: SellerType
  id: string
  /** Studio role of the caller; creators act as themselves. */
  role: StudioRole | 'CREATOR'
  permissions: StudioPermission[]
}

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as StudioPermission[]

const DAY = 24 * 3600_000

/** Aggregations only. Resources the seller owns, as (type, id) pairs. */
function ownedResourcesSql(type: SellerType) {
  return type === 'creator'
    ? `select 'video'::text as t, id from videos where creator_id = $1
       union all select resource_type, resource_id from adult_resources where creator_id = $1
       union all select 'live', id from live_streams where creator_id = $1
       union all select 'collection', id from collections where owner_type = 'creator' and owner_id = $1`
    : `select 'movie'::text as t, id from movies where studio_id = $1
       union all select 'series', id from series where studio_id = $1
       union all select 'season', se.id from seasons se join series s on s.id = se.series_id where s.studio_id = $1
       union all select 'episode', e.id from episodes e join seasons se on se.id = e.season_id
                   join series s on s.id = se.series_id where s.studio_id = $1
       union all select 'live', id from live_streams where studio_id = $1
       union all select 'collection', id from collections where owner_type = 'studio' and owner_id = $1`
}

const int = (v: unknown) => Number(v ?? 0)
const money = (v: unknown) =>
  v == null ? '0' : parseMinor(String(v)).toString()

async function countBy(db: Queryable, sql: string, params: unknown[]) {
  const rows = await db.query(sql, params)
  return Object.fromEntries(rows.map(r => [r.k, int(r.n)])) as Record<
    string,
    number
  >
}

registerRoutes(ctx => {
  const {app, db} = ctx

  // ------------------------------------------------------------ authorization

  async function adult(req: FastifyRequest) {
    const did = await ctx.user(req)
    if (!(await isAgeVerified(db, did)))
      throw forbidden('age_verification_required')
    return did
  }

  /** The caller's own creator account: viewers get 403, never a dashboard. */
  async function creatorSeller(req: FastifyRequest) {
    const did = await adult(req)
    const creator = await getApprovedCreatorForDid(db, did)
    const seller: Seller = {
      type: 'creator',
      id: creator.id,
      role: 'CREATOR',
      permissions: ALL_PERMISSIONS.filter(
        p => p !== 'manageTeam' && p !== 'viewTeam',
      ),
    }
    return {did, seller}
  }

  /** A studio the caller belongs to, with the capability `need` (if any). */
  async function studioSeller(
    req: FastifyRequest,
    studioId: string,
    need?: StudioPermission,
  ) {
    const did = await adult(req)
    const row = await studioRole(db, studioId, did)
    // Non-members learn nothing, not even that the studio exists.
    if (!row) throw notFound()
    const permissions = permissionsFor(row.role)
    if (need && !permissions.includes(need)) {
      await audit(db, {
        actor: did,
        action: `dashboard.${need}`,
        resourceType: 'studio',
        resourceId: studioId,
        result: 'denied',
      })
      throw forbidden('insufficient_role')
    }
    const seller: Seller = {
      type: 'studio',
      id: studioId,
      role: row.role,
      permissions,
    }
    return {did, seller, verification: row.verification_status}
  }

  /**
   * Registers the same handler for the creator dashboard and each studio
   * dashboard: `/dashboard/creator{path}` and `/dashboard/studios/:studioId{path}`.
   */
  function both(
    method: 'get' | 'post' | 'patch',
    path: string,
    need: StudioPermission | null,
    handler: (
      req: FastifyRequest,
      s: {did: string; seller: Seller},
    ) => Promise<unknown>,
  ) {
    app[method](`/dashboard/creator${path}`, async req =>
      handler(req, await creatorSeller(req)),
    )
    app[method](`/dashboard/studios/:studioId${path}`, async req => {
      const {studioId} = z
        .object({studioId: z.string().min(1).max(100)})
        .parse(req.params)
      return handler(req, await studioSeller(req, studioId, need ?? undefined))
    })
  }

  const can = (s: Seller, p: StudioPermission) => s.permissions.includes(p)

  // ------------------------------------------------------------ sections

  async function contentSummary(s: Seller) {
    if (s.type === 'creator') {
      const videos = await countBy(
        db,
        `select status as k, count(*)::int as n from videos where creator_id = $1 group by status`,
        [s.id],
      )
      const posts = await countBy(
        db,
        `select status as k, count(*)::int as n from adult_resources where creator_id = $1 group by status`,
        [s.id],
      )
      const [col] = await db.query(
        `select count(*)::int as n from collections where owner_type = 'creator' and owner_id = $1`,
        [s.id],
      )
      return {videos, posts, collections: int(col?.n)}
    }
    const movies = await countBy(
      db,
      `select status as k, count(*)::int as n from movies where studio_id = $1 group by status`,
      [s.id],
    )
    const series = await countBy(
      db,
      `select status as k, count(*)::int as n from series where studio_id = $1 group by status`,
      [s.id],
    )
    const [ep] = await db.query(
      `select count(*)::int as n from episodes e join seasons se on se.id = e.season_id
         join series s on s.id = se.series_id where s.studio_id = $1`,
      [s.id],
    )
    const [col] = await db.query(
      `select count(*)::int as n from collections where owner_type = 'studio' and owner_id = $1`,
      [s.id],
    )
    return {movies, series, episodes: int(ep?.n), collections: int(col?.n)}
  }

  /** Media the seller's work uses (studios) or the creator uploaded. */
  function mediaScopeSql(s: Seller) {
    return s.type === 'creator'
      ? `select id from media_assets where owner_did = (select did from creators where id = $1)`
      : `select media_asset_id as id from movies where studio_id = $1
         union select preview_asset_id from movies where studio_id = $1
         union select poster_asset_id from movies where studio_id = $1
         union select poster_asset_id from series where studio_id = $1
         union select e.media_asset_id from episodes e join seasons se on se.id = e.season_id
                join series s on s.id = se.series_id where s.studio_id = $1
         union select e.preview_asset_id from episodes e join seasons se on se.id = e.season_id
                join series s on s.id = se.series_id where s.studio_id = $1
         union select avatar_asset_id from studios where id = $1
         union select banner_asset_id from studios where id = $1`
  }

  /** Upload lifecycle as the dashboard shows it. */
  const MEDIA_STATE: Record<string, string> = {
    UPLOADING: 'uploading',
    UPLOADED: 'processing',
    QUEUED: 'processing',
    PROCESSING: 'processing',
    READY: 'ready',
    FAILED: 'failed',
    QUARANTINED: 'quarantined',
    REMOVED: 'removed',
  }

  async function mediaSummary(s: Seller) {
    const raw = await countBy(
      db,
      `select status as k, count(*)::int as n from media_assets
        where id in (${mediaScopeSql(s)}) group by status`,
      [s.id],
    )
    const out: Record<string, number> = {
      uploading: 0,
      processing: 0,
      ready: 0,
      failed: 0,
      quarantined: 0,
      removed: 0,
    }
    for (const [status, n] of Object.entries(raw))
      out[MEDIA_STATE[status] ?? 'processing'] += n
    return out
  }

  async function subscriptionSummary(s: Seller) {
    const [enabled] = await db.query(
      s.type === 'creator'
        ? `select subscriptions_enabled as on from creators where id = $1`
        : `select subscriptions_enabled as on from studios where id = $1`,
      [s.id],
    )
    const [subs] = await db.query(
      `select count(*) filter (where status = 'ACTIVE' and current_period_end > now())::int as active,
              count(*) filter (where status in ('ACTIVE', 'PAST_DUE', 'CANCELLED') and current_period_end > now())::int as with_access
         from subscriptions where target_type = $2 and target_id = $1`,
      [s.id, s.type],
    )
    const [tiers] = await db.query(
      `select count(*) filter (where active)::int as active, count(*)::int as total
         from subscription_tiers where owner_type = $2 and owner_id = $1`,
      [s.id, s.type],
    )
    return {
      enabled: !!enabled?.on,
      activeSubscribers: int(subs?.active),
      subscribersWithAccess: int(subs?.with_access),
      activeTiers: int(tiers?.active),
      totalTiers: int(tiers?.total),
    }
  }

  async function liveSummary(s: Seller) {
    return countBy(
      db,
      `select status as k, count(*)::int as n from live_streams
        where ${s.type === 'creator' ? 'creator_id' : 'studio_id'} = $1 group by status`,
      [s.id],
    )
  }

  async function safetySummary(s: Seller) {
    const [under] = await db.query(
      s.type === 'creator'
        ? `select (select count(*)::int from videos where creator_id = $1 and status in ('quarantined', 'removed')) +
                  (select count(*)::int from adult_resources where creator_id = $1 and status in ('quarantined', 'removed')) as n`
        : `select (select count(*)::int from movies where studio_id = $1 and status in ('quarantined', 'removed')) +
                  (select count(*)::int from series where studio_id = $1 and status in ('quarantined', 'removed')) as n`,
      [s.id],
    )
    const [reports] = await db.query(
      `select count(*)::int as n from live_reports r join live_streams l on l.id = r.stream_id
        where ${s.type === 'creator' ? 'l.creator_id' : 'l.studio_id'} = $1
          and r.created_at > now() - interval '30 days'`,
      [s.id],
    )
    return {
      contentUnderModeration: int(under?.n),
      liveReportsLast30Days: int(reports?.n),
    }
  }

  async function offersSummary(s: Seller) {
    const kinds = await countBy(
      db,
      `select kind as k, count(*)::int as n from offers
        where seller_type = $2 and seller_id = $1 and active and kind <> 'subscription' group by kind`,
      [s.id, s.type],
    )
    const [orders] = await db.query(
      `select count(*)::int as n from orders where seller_type = $2 and seller_id = $1 and confirmed_at is not null`,
      [s.id, s.type],
    )
    return {
      activeOffers: {
        ppv: kinds.ppv ?? 0,
        purchase: kinds.purchase ?? 0,
        rental: kinds.rental ?? 0,
      },
      paidOrders: int(orders?.n),
    }
  }

  // ------------------------------------------------------------ home

  both('get', '', null, async (_req, {did, seller}) => {
    const [content, media, subscriptions, live, safety, offers] =
      await Promise.all([
        can(seller, 'viewContent') ? contentSummary(seller) : null,
        can(seller, 'viewContent') ? mediaSummary(seller) : null,
        can(seller, 'sell') || can(seller, 'viewAnalytics')
          ? subscriptionSummary(seller)
          : null,
        can(seller, 'viewContent') ? liveSummary(seller) : null,
        can(seller, 'viewSafety') ? safetySummary(seller) : null,
        can(seller, 'sell') || can(seller, 'viewRevenue')
          ? offersSummary(seller)
          : null,
      ])
    const revenue = can(seller, 'viewRevenue')
      ? await ledgerSummary(db, seller.type, seller.id)
      : null
    let studios: unknown[] | null = null
    let profile: Record<string, unknown>
    if (seller.type === 'creator') {
      const [c] = await db.query(
        `select handle, display_name from creators where id = $1`,
        [seller.id],
      )
      profile = {
        creatorId: seller.id,
        handle: c?.handle,
        displayName: c?.display_name,
      }
      studios = (
        await db.query(
          `select s.id, s.name, s.handle, s.verification_status, m.role
             from studio_members m join studios s on s.id = m.studio_id
            where m.member_did = $1 order by s.name`,
          [did],
        )
      ).map(r => ({
        id: r.id,
        name: r.name,
        handle: r.handle,
        verification: r.verification_status,
        role: r.role,
      }))
    } else {
      const [st] = await db.query(
        `select name, handle, verification_status from studios where id = $1`,
        [seller.id],
      )
      profile = {
        studioId: seller.id,
        name: st.name,
        handle: st.handle,
        verification: st.verification_status,
      }
    }
    return {
      seller: {
        type: seller.type,
        role: seller.role,
        permissions: seller.permissions,
        ...profile,
      },
      content,
      media,
      subscriptions,
      offers,
      revenue,
      live,
      safety,
      studios,
    }
  })

  /** Studios the caller belongs to (entry point for /adult/studio/dashboard). */
  app.get('/dashboard/studios', async req => {
    const did = await adult(req)
    const rows = await db.query(
      `select s.id, s.name, s.handle, s.verification_status, m.role
         from studio_members m join studios s on s.id = m.studio_id
        where m.member_did = $1 order by s.name`,
      [did],
    )
    return {
      studios: rows.map(r => ({
        id: r.id,
        name: r.name,
        handle: r.handle,
        verification: r.verification_status,
        role: r.role,
        permissions: permissionsFor(r.role),
      })),
    }
  })

  // ------------------------------------------------------------ content manager

  const offersFor = async (type: string, ids: string[]) => {
    if (!ids.length) return new Map<string, unknown[]>()
    const rows = await db.query(
      `select id, resource_id, kind, price_minor, currency, access_hours from offers
        where resource_type = $1 and resource_id = any($2) and active and kind <> 'subscription'
        order by price_minor`,
      [type, ids],
    )
    const map = new Map<string, unknown[]>()
    for (const o of rows) {
      const list = map.get(o.resource_id) ?? []
      list.push({
        id: o.id,
        kind: o.kind,
        priceMinor: String(o.price_minor),
        currency: o.currency,
        accessHours: o.access_hours,
      })
      map.set(o.resource_id, list)
    }
    return map
  }

  both('get', '/content', 'viewContent', async (req, {seller}) => {
    const q = z
      .object({
        section: z
          .enum([
            'all',
            'posts',
            'videos',
            'media',
            'collections',
            'drafts',
            'scheduled',
            'archived',
            'titles',
          ])
          .default('all'),
      })
      .parse(req.query)
    const out: Record<string, unknown> = {}
    const want = (s: string) => q.section === 'all' || q.section === s

    if (seller.type === 'creator') {
      const statusFilter: Record<string, string> = {
        drafts: `and v.status = 'draft'`,
        scheduled: `and v.status = 'scheduled' and v.scheduled_at > now()`,
        archived: `and v.status = 'archived'`,
        videos: '',
        all: '',
      }
      if (q.section in statusFilter) {
        const rows = await db.query(
          `select v.id, v.title, v.category, v.status, v.access_policy, v.required_tier_id, v.view_count,
                  v.published_at, v.scheduled_at, v.archived_at, v.created_at, v.preview_asset_id,
                  a.status as media_status
             from videos v join media_assets a on a.id = v.media_asset_id
            where v.creator_id = $1 ${statusFilter[q.section]}
            order by v.created_at desc limit 200`,
          [seller.id],
        )
        const offers = await offersFor(
          'video',
          rows.map(r => r.id),
        )
        out.videos = rows.map(r => ({
          id: r.id,
          title: r.title,
          category: r.category,
          status:
            r.status === 'scheduled' &&
            r.scheduled_at &&
            new Date(r.scheduled_at) <= new Date()
              ? 'published'
              : r.status,
          accessPolicy: r.access_policy,
          requiredTierId: r.required_tier_id,
          mediaStatus: MEDIA_STATE[r.media_status] ?? 'processing',
          hasPreview: !!r.preview_asset_id,
          viewCount: String(r.view_count),
          publishedAt: r.published_at,
          scheduledAt: r.scheduled_at,
          archivedAt: r.archived_at,
          createdAt: r.created_at,
          offers: offers.get(r.id) ?? [],
        }))
      }
      if (want('posts') || q.section === 'drafts') {
        const rows = await db.query(
          `select resource_type, resource_id, access_policy, required_tier_id, status, created_at
             from adult_resources where creator_id = $1 ${q.section === 'drafts' ? `and status = 'draft'` : ''}
            order by created_at desc limit 200`,
          [seller.id],
        )
        out.posts = rows.map(r => ({
          type: r.resource_type,
          uri: r.resource_id,
          accessPolicy: r.access_policy,
          requiredTierId: r.required_tier_id,
          status: r.status,
          createdAt: r.created_at,
        }))
      }
    } else if (
      want('titles') ||
      ['drafts', 'scheduled', 'archived'].includes(q.section)
    ) {
      const filter: Record<string, string> = {
        drafts: `and status = 'draft'`,
        scheduled: `and status = 'scheduled'`,
        archived: `and status = 'archived'`,
      }
      const f = filter[q.section] ?? ''
      const movies = await db.query(
        `select id, title, status, access_policy, required_tier_id, release_date, availability_start,
                availability_end, allowed_regions, view_count, media_asset_id, created_at
           from movies where studio_id = $1 ${f} order by created_at desc limit 200`,
        [seller.id],
      )
      const series = await db.query(
        `select id, title, status, access_policy, required_tier_id, availability_start, availability_end,
                allowed_regions, created_at,
                (select count(*)::int from seasons se where se.series_id = series.id) as seasons,
                (select count(*)::int from episodes e join seasons se on se.id = e.season_id
                  where se.series_id = series.id) as episodes
           from series where studio_id = $1 ${f} order by created_at desc limit 200`,
        [seller.id],
      )
      const movieOffers = await offersFor(
        'movie',
        movies.map(m => m.id),
      )
      const seriesOffers = await offersFor(
        'series',
        series.map(s => s.id),
      )
      const credits = await countBy(
        db,
        `select item_id as k, count(*)::int as n from production_credits
          where item_id = any($1) group by item_id`,
        [[...movies.map(m => m.id), ...series.map(s => s.id)]],
      )
      const title = (r: any, offers: Map<string, unknown[]>) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        accessPolicy: r.access_policy,
        requiredTierId: r.required_tier_id,
        releaseDate: r.release_date ?? null,
        availabilityStart: r.availability_start,
        availabilityEnd: r.availability_end,
        allowedRegions: r.allowed_regions,
        credits: credits[r.id] ?? 0,
        offers: offers.get(r.id) ?? [],
        createdAt: r.created_at,
      })
      out.movies = movies.map(m => ({
        ...title(m, movieOffers),
        viewCount: String(m.view_count),
      }))
      out.series = series.map(s => ({
        ...title(s, seriesOffers),
        seasons: s.seasons,
        episodes: s.episodes,
      }))
    }
    if (want('collections')) {
      const rows = await db.query(
        `select c.id, c.title, c.status, c.access_policy, c.created_at,
                (select count(*)::int from collection_items i where i.collection_id = c.id) as items
           from collections c where c.owner_type = $2 and c.owner_id = $1
          order by c.created_at desc limit 200`,
        [seller.id, seller.type],
      )
      out.collections = rows.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        accessPolicy: r.access_policy,
        items: r.items,
        createdAt: r.created_at,
      }))
    }
    if (want('media')) out.media = await listMedia(seller, undefined)
    return out
  })

  // ------------------------------------------------------------ media manager

  /** Lists media through the Media Engine's own records. No parallel storage. */
  async function listMedia(s: Seller, callerDid: string | undefined) {
    const rows = await db.query(
      `select id, kind, purpose, status, mime_type, size_bytes, duration_ms, width, height, error, created_at
         from media_assets
        where id in (${mediaScopeSql(s)})
           ${callerDid ? `or (owner_did = $2 and id not in (select media_asset_id from videos where media_asset_id is not null))` : ''}
        order by created_at desc limit 300`,
      callerDid ? [s.id, callerDid] : [s.id],
    )
    return rows.map(a => ({
      id: a.id,
      kind: a.kind,
      purpose: a.purpose,
      state: MEDIA_STATE[a.status] ?? 'processing',
      status: a.status,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes == null ? null : String(a.size_bytes),
      durationMs: a.duration_ms,
      width: a.width,
      height: a.height,
      // Engine errors are internal; the dashboard only says it failed.
      failed: a.status === 'FAILED',
      createdAt: a.created_at,
    }))
  }

  both('get', '/media', 'viewContent', async (_req, {did, seller}) => {
    // Studio editors also see their own not-yet-used uploads to attach them.
    const own =
      seller.type === 'studio' && can(seller, 'editTitles') ? did : undefined
    return {
      summary: await mediaSummary(seller),
      assets: await listMedia(seller, own),
    }
  })

  // ------------------------------------------------------------ content creation

  /**
   * Creator video with visibility, policy, preview, price, tier, publication
   * time and metadata in one call. A paid policy without a price is refused:
   * content never becomes free because a step failed.
   */
  app.post('/dashboard/creator/videos', async req => {
    const {did} = await creatorSeller(req)
    const body = videoBody.parse(req.body)
    const result = await createCreatorVideo(db, did, body, {
      requireOfferForPaid: true,
    })
    await audit(db, {
      actor: did,
      action: 'dashboard.video.create',
      resourceType: 'video',
      resourceId: result.videoId,
      result: 'ok',
    })
    return result
  })

  // ------------------------------------------------------------ subscriptions

  both('get', '/subscriptions', 'sell', async (_req, {seller}) => {
    const tiers = await db.query(
      `select t.id, t.name, t.description, t.price_minor, t.currency, t.billing_period, t.benefits, t.active,
              t.created_at,
              (select count(*)::int from subscriptions s where s.tier_id = t.id and s.status = 'ACTIVE'
                  and s.current_period_end > now()) as active_subscribers,
              (select count(*)::int from subscriptions s where s.tier_id = t.id) as all_time
         from subscription_tiers t where t.owner_type = $2 and t.owner_id = $1
        order by t.active desc, t.price_minor`,
      [seller.id, seller.type],
    )
    return {
      ...(await subscriptionSummary(seller)),
      tiers: tiers.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        priceMinor: String(t.price_minor),
        currency: t.currency,
        billingPeriod: t.billing_period,
        benefits: t.benefits,
        active: t.active,
        activeSubscribers: t.active_subscribers,
        allTimeSubscriptions: t.all_time,
        createdAt: t.created_at,
      })),
    }
  })

  both('patch', '/settings', 'sell', async (req, {did, seller}) => {
    const body = z.object({subscriptionsEnabled: z.boolean()}).parse(req.body)
    // Studios must also pass the seller check (verified, OWNER/ADMIN).
    await assertSeller(db, did, seller.type, seller.id)
    if (body.subscriptionsEnabled) {
      const [tier] = await db.query(
        `select 1 from subscription_tiers where owner_type = $1 and owner_id = $2 and active limit 1`,
        [seller.type, seller.id],
      )
      if (!tier) throw conflict('no_active_tier')
    }
    // Only the switch changes: existing subscriptions and history stay as-is.
    await db.query(
      seller.type === 'creator'
        ? `update creators set subscriptions_enabled = $2 where id = $1`
        : `update studios set subscriptions_enabled = $2 where id = $1`,
      [seller.id, body.subscriptionsEnabled],
    )
    await audit(db, {
      actor: did,
      action: `dashboard.subscriptions.${body.subscriptionsEnabled ? 'enable' : 'disable'}`,
      resourceType: seller.type,
      resourceId: seller.id,
      result: 'ok',
    })
    return {ok: true}
  })

  // ------------------------------------------------------------ PPV / one-off offers

  both('get', '/offers', 'sell', async (_req, {seller}) => {
    const rows = await db.query(
      `select o.id, o.kind, o.resource_type, o.resource_id, o.price_minor, o.currency, o.access_hours,
              o.active, o.created_at,
              (select count(*)::int from orders r where r.offer_id = o.id and r.confirmed_at is not null) as sales
         from offers o where o.seller_type = $2 and o.seller_id = $1 and o.kind <> 'subscription'
        order by o.active desc, o.created_at desc limit 300`,
      [seller.id, seller.type],
    )
    return {
      offers: rows.map(o => ({
        id: o.id,
        kind: o.kind,
        resourceType: o.resource_type,
        resourceId: o.resource_id,
        priceMinor: String(o.price_minor),
        currency: o.currency,
        accessHours: o.access_hours,
        active: o.active,
        sales: o.sales,
        createdAt: o.created_at,
      })),
    }
  })

  /**
   * Retires or re-prices a one-off offer. Re-pricing creates a new offer and
   * retires the old one, so past orders keep pointing at what was paid.
   */
  app.patch('/dashboard/offers/:id', async req => {
    const did = await adult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        active: z.boolean().optional(),
        priceMinor: z.union([z.number(), z.string()]).optional(),
      })
      .parse(req.body)
    const [offer] = await db.query(`select * from offers where id = $1`, [id])
    if (!offer) throw notFound()
    try {
      await assertSeller(db, did, offer.seller_type, offer.seller_id)
    } catch (e) {
      await audit(db, {
        actor: did,
        action: 'dashboard.offer.update',
        resourceType: 'offer',
        resourceId: id,
        result: 'denied',
      })
      throw e
    }
    if (offer.kind === 'subscription') throw badRequest('use_tier_endpoint')
    if (body.priceMinor !== undefined) {
      if (!offer.active) throw conflict('offer_inactive')
      const price = assertPrice(body.priceMinor, assertCurrency(offer.currency))
      const newOfferId = newId('offer')
      await db.transaction(async tx => {
        await tx.query(`update offers set active = false where id = $1`, [id])
        await tx.query(
          `insert into offers (id, seller_type, seller_id, kind, resource_type, resource_id, price_minor, currency, access_hours)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            newOfferId,
            offer.seller_type,
            offer.seller_id,
            offer.kind,
            offer.resource_type,
            offer.resource_id,
            price.toString(),
            offer.currency,
            offer.access_hours,
          ],
        )
      })
      await audit(db, {
        actor: did,
        action: 'dashboard.offer.reprice',
        resourceType: 'offer',
        resourceId: id,
        reason: newOfferId,
        result: 'ok',
      })
      return {offerId: newOfferId}
    }
    if (body.active !== undefined) {
      await db.query(`update offers set active = $2 where id = $1`, [
        id,
        body.active,
      ])
      await audit(db, {
        actor: did,
        action: `dashboard.offer.${body.active ? 'activate' : 'deactivate'}`,
        resourceType: 'offer',
        resourceId: id,
        result: 'ok',
      })
    }
    return {offerId: id}
  })

  // ------------------------------------------------------------ analytics

  both('get', '/analytics', 'viewAnalytics', async (req, {seller}) => {
    const {days} = z
      .object({days: z.coerce.number().int().min(1).max(365).default(30)})
      .parse(req.query)
    const since = new Date(Date.now() - days * DAY)
    const owned = ownedResourcesSql(seller.type)
    const [views] = await db.query(
      `with owned as (${owned})
       select count(*)::int as views, count(distinct e.user_did)::int as viewers
         from view_events e join owned o on o.t = e.resource_type and o.id = e.resource_id
        where e.window_start >= $2`,
      [seller.id, since],
    )
    const [watch] = await db.query(
      `with owned as (${owned})
       select coalesce(sum(p.position_ms), 0)::text as ms
         from adult_watch_progress p join owned o on o.t = p.resource_type and o.id = p.resource_id
        where p.updated_at >= $2`,
      [seller.id, since],
    )
    const [lifetime] = await db.query(
      seller.type === 'creator'
        ? `select coalesce(sum(view_count), 0)::text as n from videos where creator_id = $1`
        : `select (coalesce((select sum(view_count) from movies where studio_id = $1), 0) +
                   coalesce((select sum(e.view_count) from episodes e join seasons se on se.id = e.season_id
                              join series s on s.id = se.series_id where s.studio_id = $1), 0))::text as n`,
      [seller.id],
    )
    const [subs] = await db.query(
      `select count(*) filter (where status = 'ACTIVE' and current_period_end > now())::int as active,
              count(*) filter (where started_at >= $3)::int as started,
              count(*) filter (where cancelled_at >= $3)::int as cancelled
         from subscriptions where target_type = $2 and target_id = $1`,
      [seller.id, seller.type, since],
    )
    const orderCounts = await countBy(
      db,
      `select type as k, count(*)::int as n from orders
        where seller_type = $2 and seller_id = $1 and confirmed_at >= $3 group by type`,
      [seller.id, seller.type, since],
    )
    const [problems] = await db.query(
      `select count(distinct order_id) filter (where type = 'REFUND')::int as refunds,
              count(distinct order_id) filter (where type = 'CHARGEBACK')::int as chargebacks
         from ledger_entries where seller_type = $2 and seller_id = $1 and created_at >= $3`,
      [seller.id, seller.type, since],
    )
    const revenueRows = await db.query(
      `select currency, type, sum(amount_minor)::text as total from ledger_entries
        where seller_type = $2 and seller_id = $1 and created_at >= $3 group by currency, type`,
      [seller.id, seller.type, since],
    )
    const revenue: Record<string, Record<string, string>> = {}
    for (const r of revenueRows) {
      const c = (revenue[r.currency] ??= {
        gross: '0',
        platformFees: '0',
        processingFees: '0',
        refunds: '0',
        chargebacks: '0',
        net: '0',
      })
      const key: Record<string, string> = {
        SALE: 'gross',
        PLATFORM_FEE: 'platformFees',
        PROCESSING_FEE: 'processingFees',
        REFUND: 'refunds',
        CHARGEBACK: 'chargebacks',
      }
      if (key[r.type]) c[key[r.type]] = money(r.total)
      if (r.type !== 'PAYOUT')
        c.net = (BigInt(c.net) + parseMinor(r.total)).toString()
    }
    const viewers = int(views?.viewers)
    const started = int(subs?.started)
    return {
      periodDays: days,
      since: since.toISOString(),
      views: int(views?.views),
      uniqueViewers: viewers,
      lifetimeViews: money(lifetime?.n),
      watchTimeMs: money(watch?.ms),
      subscribers: int(subs?.active),
      newSubscriptions: started,
      cancelledSubscriptions: int(subs?.cancelled),
      // New subscriptions per unique viewer, in basis points. null = no viewers.
      subscriptionConversionBps: viewers
        ? Math.round((started * 10000) / viewers)
        : null,
      ppvPurchases: orderCounts.ppv ?? 0,
      purchases: orderCounts.purchase ?? 0,
      rentals: orderCounts.rental ?? 0,
      refunds: int(problems?.refunds),
      chargebacks: int(problems?.chargebacks),
      revenue,
    }
  })

  // ------------------------------------------------------------ revenue

  async function openPayouts(s: Seller) {
    const rows = await db.query(
      `select currency, sum(amount_minor)::text as total from payout_requests
        where seller_type = $2 and seller_id = $1 and status in ('REQUESTED', 'APPROVED')
        group by currency`,
      [s.id, s.type],
    )
    return Object.fromEntries(rows.map(r => [r.currency, parseMinor(r.total)]))
  }

  /** Balances straight from the ledger; the app never computes them. */
  async function balances(s: Seller) {
    const summary = await ledgerSummary(db, s.type, s.id)
    const open = await openPayouts(s)
    return Object.fromEntries(
      Object.entries(summary).map(([currency, b]) => {
        const requestable = BigInt(b.available) - (open[currency] ?? 0n)
        return [
          currency,
          {
            ...b,
            requestedPayouts: (open[currency] ?? 0n).toString(),
            requestable: (requestable > 0n ? requestable : 0n).toString(),
          },
        ]
      }),
    )
  }

  both('get', '/revenue', 'viewRevenue', async (_req, {seller}) => {
    const entries = await db.query(
      `select l.id, l.type, l.amount_minor, l.currency, l.created_at, o.type as order_type
         from ledger_entries l left join orders o on o.id = l.order_id
        where l.seller_type = $2 and l.seller_id = $1
        order by l.id desc limit 100`,
      [seller.id, seller.type],
    )
    return {
      balances: await balances(seller),
      // Movements only — never who bought.
      entries: entries.map(e => ({
        id: String(e.id),
        type: e.type,
        orderType: e.order_type,
        amountMinor: money(e.amount_minor),
        currency: e.currency,
        createdAt: e.created_at,
      })),
    }
  })

  // ------------------------------------------------------------ payouts (architecture only)

  const publicAccount = (a: any) =>
    a
      ? {
          id: a.id,
          status: a.status,
          provider: a.provider,
          createdAt: a.created_at,
        }
      : null

  both('get', '/payouts', 'viewRevenue', async (_req, {seller}) => {
    const [account] = await db.query(
      `select * from payout_accounts where seller_type = $2 and seller_id = $1`,
      [seller.id, seller.type],
    )
    const requests = await db.query(
      `select id, amount_minor, currency, status, created_at, decided_at from payout_requests
        where seller_type = $2 and seller_id = $1 order by created_at desc limit 100`,
      [seller.id, seller.type],
    )
    const payouts = await db.query(
      `select p.id, p.payout_request_id, p.amount_minor, p.currency, p.status, p.created_at, p.completed_at
         from payouts p join payout_requests r on r.id = p.payout_request_id
        where r.seller_type = $2 and r.seller_id = $1 order by p.created_at desc limit 100`,
      [seller.id, seller.type],
    )
    return {
      // No payout provider is configured: requests are recorded, never paid.
      providerConfigured: false,
      account: publicAccount(account),
      balances: await balances(seller),
      requests: requests.map(r => ({
        id: r.id,
        amountMinor: money(r.amount_minor),
        currency: r.currency,
        status: r.status,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
      })),
      payouts: payouts.map(p => ({
        id: p.id,
        requestId: p.payout_request_id,
        amountMinor: money(p.amount_minor),
        currency: p.currency,
        status: p.status,
        createdAt: p.created_at,
        completedAt: p.completed_at,
      })),
    }
  })

  /** Starts onboarding. Accepts no bank or card data — ever. */
  both(
    'post',
    '/payout-account',
    'managePayouts',
    async (_req, {did, seller}) => {
      const [existing] = await db.query(
        `select * from payout_accounts where seller_type = $2 and seller_id = $1`,
        [seller.id, seller.type],
      )
      if (existing) return {account: publicAccount(existing)}
      const [row] = await db.query(
        `insert into payout_accounts (id, seller_type, seller_id, created_by) values ($1, $2, $3, $4) returning *`,
        [newId('pacct'), seller.type, seller.id, did],
      )
      await audit(db, {
        actor: did,
        action: 'dashboard.payout_account.create',
        resourceType: seller.type,
        resourceId: seller.id,
        result: 'ok',
      })
      return {account: publicAccount(row)}
    },
  )

  both(
    'post',
    '/payout-requests',
    'managePayouts',
    async (req, {did, seller}) => {
      const body = z
        .object({
          amountMinor: z.union([z.number(), z.string()]),
          currency: z.string().length(3),
        })
        .parse(req.body)
      const currency = assertCurrency(body.currency)
      const amount = parseMinor(body.amountMinor)
      if (amount <= 0n) throw badRequest('invalid_amount')
      const id = newId('preq')
      await db.transaction(async tx => {
        // Row lock serializes concurrent requests for the same seller.
        const [account] = await tx.query(
          `select * from payout_accounts where seller_type = $2 and seller_id = $1 for update`,
          [seller.id, seller.type],
        )
        if (!account || account.status !== 'VERIFIED')
          throw conflict('payout_account_not_verified')
        const summary = await ledgerSummary(tx, seller.type, seller.id)
        const [open] = await tx.query(
          `select coalesce(sum(amount_minor), 0)::text as total from payout_requests
          where seller_type = $2 and seller_id = $1 and currency = $3 and status in ('REQUESTED', 'APPROVED')`,
          [seller.id, seller.type, currency],
        )
        const available =
          BigInt(summary[currency]?.available ?? '0') - parseMinor(open.total)
        if (amount > available) throw conflict('insufficient_available_balance')
        await tx.query(
          `insert into payout_requests (id, seller_type, seller_id, payout_account_id, amount_minor, currency, requested_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id,
            seller.type,
            seller.id,
            account.id,
            amount.toString(),
            currency,
            did,
          ],
        )
      })
      await audit(db, {
        actor: did,
        action: 'dashboard.payout.request',
        resourceType: 'payout_request',
        resourceId: id,
        result: 'ok',
      })
      return {requestId: id, status: 'REQUESTED'}
    },
  )

  both(
    'post',
    '/payout-requests/:requestId/cancel',
    'managePayouts',
    async (req, {did, seller}) => {
      const {requestId} = z.object({requestId: z.string()}).parse(req.params)
      const rows = await db.query(
        `update payout_requests set status = 'CANCELLED', decided_at = now()
        where id = $1 and seller_type = $3 and seller_id = $2 and status = 'REQUESTED' returning id`,
        [requestId, seller.id, seller.type],
      )
      if (!rows.length) throw notFound()
      await audit(db, {
        actor: did,
        action: 'dashboard.payout.cancel',
        resourceType: 'payout_request',
        resourceId: requestId,
        result: 'ok',
      })
      return {ok: true}
    },
  )

  /** Simulated provider onboarding — a real payout provider replaces this. */
  both(
    'post',
    '/dev/payout-account/verify',
    'managePayouts',
    async (_req, {seller}) => {
      ctx.devOnly()
      const rows = await db.query(
        `update payout_accounts set status = 'VERIFIED', provider = 'dev-simulated', updated_at = now()
        where seller_type = $2 and seller_id = $1 returning id`,
        [seller.id, seller.type],
      )
      if (!rows.length) throw notFound()
      return {ok: true}
    },
  )

  // ------------------------------------------------------------ safety

  both('get', '/safety', 'viewSafety', async (_req, {seller}) => {
    const items =
      seller.type === 'creator'
        ? await db.query(
            `select 'video' as type, id, title, status from videos
              where creator_id = $1 and status in ('quarantined', 'removed')
             union all
             select resource_type, resource_id, null, status from adult_resources
              where creator_id = $1 and status in ('quarantined', 'removed')`,
            [seller.id],
          )
        : await db.query(
            `select 'movie' as type, id, title, status from movies
              where studio_id = $1 and status in ('quarantined', 'removed')
             union all
             select 'series', id, title, status from series
              where studio_id = $1 and status in ('quarantined', 'removed')`,
            [seller.id],
          )
    // Report counts by reason — never who reported or what they wrote.
    const reports = await db.query(
      `select l.id as stream_id, l.title, r.reason, count(*)::int as n
         from live_reports r join live_streams l on l.id = r.stream_id
        where ${seller.type === 'creator' ? 'l.creator_id' : 'l.studio_id'} = $1
        group by l.id, l.title, r.reason order by l.id`,
      [seller.id],
    )
    const media = await mediaSummary(seller)
    return {
      ...(await safetySummary(seller)),
      underModeration: items.map(i => ({
        type: i.type,
        id: i.id,
        title: i.title,
        status: i.status,
      })),
      liveReports: reports.map(r => ({
        streamId: r.stream_id,
        title: r.title,
        reason: r.reason,
        count: r.n,
      })),
      media: {
        quarantined: media.quarantined,
        removed: media.removed,
        failed: media.failed,
      },
    }
  })

  // ------------------------------------------------------------ live

  both('get', '/live', 'viewContent', async (_req, {seller}) => {
    const rows = await db.query(
      `select id, title, status, access_policy, scheduled_at, started_at, ended_at, peak_viewers, recording_asset_id
         from live_streams where ${seller.type === 'creator' ? 'creator_id' : 'studio_id'} = $1
        order by coalesce(started_at, scheduled_at, created_at) desc limit 100`,
      [seller.id],
    )
    return {
      summary: await liveSummary(seller),
      streams: rows.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        accessPolicy: r.access_policy,
        scheduledAt: r.scheduled_at,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        peakViewers: r.peak_viewers,
        hasRecording: !!r.recording_asset_id,
      })),
    }
  })

  // ------------------------------------------------------------ studio team

  app.get('/dashboard/studios/:studioId/team', async req => {
    const {studioId} = z.object({studioId: z.string()}).parse(req.params)
    await studioSeller(req, studioId, 'viewTeam')
    const rows = await db.query(
      `select member_did, role, added_at from studio_members where studio_id = $1
        order by case role when 'OWNER' then 0 when 'ADMIN' then 1 when 'EDITOR' then 2
                           when 'ANALYST' then 3 else 4 end, added_at`,
      [studioId],
    )
    return {
      members: rows.map(r => ({
        did: r.member_did,
        role: r.role,
        permissions: permissionsFor(r.role),
        addedAt: r.added_at,
      })),
    }
  })
})
