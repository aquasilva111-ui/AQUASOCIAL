import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {
  type AccessDecision,
  assertAdultAccess,
  checkAccess,
  resolveResource,
  type ResourceRef,
} from '../entitlements/index.js'
import {badRequest, notFound} from '../lib/errors.js'
import {type MediaEngine} from '../media/engine.js'
import {registerRoutes} from '../registry.js'

const LIBRARY_TYPES = [
  'video',
  'movie',
  'series',
  'season',
  'episode',
  'collection',
  'post',
] as const
const SECTION_LIMIT = 50
const EXPIRED_RENTALS_DAYS = 30

export type LibraryItem = {
  type: string
  id: string
  title: string
  subtitle: string | null
  posterUrl: string | null
  /** App route, when the item has a page. */
  href: string | null
  /** False when removed/quarantined/unavailable: shown generically, never playable. */
  available: boolean
  access: AccessDecision
}

/**
 * Describes one related item for the Library. Access is recomputed now —
 * the Library never trusts that something "was bought"; it asks
 * Entitlements. Unavailable items reveal nothing but their existence.
 */
async function summarize(
  db: Queryable,
  media: MediaEngine,
  did: string,
  ref: ResourceRef,
): Promise<LibraryItem> {
  const {decision, resource} = await checkAccess(db, did, ref)
  const hidden =
    !resource ||
    resource.status === 'removed' ||
    resource.status === 'quarantined' ||
    (resource.status !== 'published' && !resource.ownerDids.includes(did))
  const base = {type: ref.type, id: ref.id, access: decision}
  if (hidden) {
    return {
      ...base,
      title: 'Conteúdo indisponível',
      subtitle: null,
      posterUrl: null,
      href: null,
      available: false,
    }
  }
  const poster = async (assetId: string | null) =>
    assetId
      ? media.authorize(assetId, 'thumbnail').then(
          r => r.url,
          () => null,
        )
      : null
  switch (ref.type) {
    case 'video': {
      const [v] = await db.query(
        `select v.title, v.poster_asset_id, c.handle from videos v join creators c on c.id = v.creator_id where v.id = $1`,
        [ref.id],
      )
      return {
        ...base,
        title: v.title,
        subtitle: v.handle ? `@${v.handle}` : null,
        posterUrl: await poster(v.poster_asset_id),
        href: `/adult/views/${ref.id}`,
        available: true,
      }
    }
    case 'movie': {
      const [m] = await db.query(
        `select m.title, m.poster_asset_id, s.name from movies m join studios s on s.id = m.studio_id where m.id = $1`,
        [ref.id],
      )
      return {
        ...base,
        title: m.title,
        subtitle: m.name,
        posterUrl: await poster(m.poster_asset_id),
        href: `/adult/title/movie/${ref.id}`,
        available: true,
      }
    }
    case 'series':
    case 'season':
    case 'episode': {
      const [row] = await db.query(
        ref.type === 'series'
          ? `select s.id as series_id, s.title, s.poster_asset_id, st.name, null as extra from series s join studios st on st.id = s.studio_id where s.id = $1`
          : ref.type === 'season'
            ? `select s.id as series_id, s.title, s.poster_asset_id, st.name, 'Temporada ' || se.number as extra
                 from seasons se join series s on s.id = se.series_id join studios st on st.id = s.studio_id where se.id = $1`
            : `select s.id as series_id, s.title, s.poster_asset_id, st.name, 'T' || se.number || ' E' || e.number || ' · ' || e.title as extra
                 from episodes e join seasons se on se.id = e.season_id join series s on s.id = se.series_id
                 join studios st on st.id = s.studio_id where e.id = $1`,
        [ref.id],
      )
      return {
        ...base,
        title: row.extra ? `${row.title} · ${row.extra}` : row.title,
        subtitle: row.name,
        posterUrl: await poster(row.poster_asset_id),
        href: `/adult/title/series/${row.series_id}`,
        available: true,
      }
    }
    case 'collection': {
      const [c] = await db.query(
        `select title from collections where id = $1`,
        [ref.id],
      )
      return {
        ...base,
        title: c.title,
        subtitle: 'Coleção',
        posterUrl: null,
        href: null,
        available: true,
      }
    }
    default:
      return {
        ...base,
        title: 'Post',
        subtitle: null,
        posterUrl: null,
        href: null,
        available: true,
      }
  }
}

async function entitlementRefs(
  db: Queryable,
  did: string,
  where: string,
  params: unknown[] = [],
) {
  return db.query<{
    resource_type: string
    resource_id: string
    expires_at: string | null
  }>(
    `select distinct on (resource_type, resource_id) resource_type, resource_id, expires_at
       from entitlements where user_did = $1 and revoked_at is null and ${where}
      order by resource_type, resource_id, expires_at desc nulls first
      limit ${SECTION_LIMIT}`,
    [did, ...params],
  )
}

registerRoutes(ctx => {
  const {app, db, media} = ctx

  const requireAdult = async (req: Parameters<typeof ctx.user>[0]) => {
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    return did
  }

  const describe = (did: string, rows: Record<string, any>[]) =>
    Promise.all(
      rows.map(r =>
        summarize(db, media, did, {
          type: String(r.resource_type),
          id: String(r.resource_id),
        }),
      ),
    )

  /**
   * PRIVATE BY DEFAULT: only the caller's own relations, never cached by
   * shared caches, never written to any public activity.
   */
  app.get('/me/library', async req => {
    const did = await requireAdult(req)
    const now = new Date()
    const [
      purchased,
      ppv,
      activeRentals,
      expiredRentals,
      collections,
      subs,
      saved,
      later,
      progress,
      history,
    ] = await Promise.all([
      entitlementRefs(
        db,
        did,
        `type = 'purchase' and resource_type <> 'collection'`,
      ),
      entitlementRefs(
        db,
        did,
        `type = 'ppv' and (expires_at is null or expires_at > now())`,
      ),
      entitlementRefs(db, did, `type = 'rental' and expires_at > now()`),
      entitlementRefs(
        db,
        did,
        `type = 'rental' and expires_at <= now() and expires_at > $2`,
        [new Date(now.getTime() - EXPIRED_RENTALS_DAYS * 86400_000)],
      ),
      entitlementRefs(
        db,
        did,
        `resource_type = 'collection' and (expires_at is null or expires_at > now())`,
      ),
      db.query(
        `select su.id, su.target_type, su.target_id, su.status, su.current_period_end, su.cancel_at_period_end,
                  t.name as tier_name, coalesce(c.handle, st.name) as target_name, st.handle as studio_handle
             from subscriptions su join subscription_tiers t on t.id = su.tier_id
             left join creators c on su.target_type = 'creator' and c.id = su.target_id
             left join studios st on su.target_type = 'studio' and st.id = su.target_id
            where su.subscriber_did = $1 and su.current_period_end > now()
              and su.status in ('ACTIVE', 'PAST_DUE', 'CANCELLED')
            order by su.current_period_end`,
        [did],
      ),
      db.query(
        `select resource_type, resource_id from library_saved where user_did = $1 order by saved_at desc limit ${SECTION_LIMIT}`,
        [did],
      ),
      db.query(
        `select resource_type, resource_id from library_watch_later where user_did = $1 order by added_at desc limit ${SECTION_LIMIT}`,
        [did],
      ),
      db.query(
        `select resource_type, resource_id, position_ms, duration_ms from adult_watch_progress
            where user_did = $1 and (duration_ms is null or position_ms < duration_ms * 0.95)
            order by updated_at desc limit 20`,
        [did],
      ),
      db.query(
        `select id, resource_type, resource_id, watched_at from adult_watch_history
            where user_did = $1 order by watched_at desc limit ${SECTION_LIMIT}`,
        [did],
      ),
    ])

    const cont = (await describe(did, progress))
      .map((item, i) => ({
        ...item,
        positionMs: progress[i].position_ms,
        durationMs: progress[i].duration_ms,
      }))
      .filter(item => item.available && item.access.allowed)
    const hist = (await describe(did, history)).map((item, i) => ({
      ...item,
      historyId: history[i].id,
      watchedAt: history[i].watched_at,
    }))
    const subscription = (s: any) => ({
      id: s.id,
      name: s.target_name,
      handle: s.studio_handle,
      tier: s.tier_name,
      status: s.status,
      renews: !s.cancel_at_period_end && s.status === 'ACTIVE',
      currentPeriodEnd: s.current_period_end,
    })

    // Sections appear only when they have something to show.
    const sections: Record<string, unknown> = {
      continueWatching: cont,
      purchased: (await describe(did, purchased)).filter(
        i => i.access.allowed || !i.available,
      ),
      ppv: (await describe(did, ppv)).filter(
        i => i.access.allowed || !i.available,
      ),
      rentals: {
        active: (await describe(did, activeRentals)).map((item, i) => ({
          ...item,
          expiresAt: activeRentals[i].expires_at,
        })),
        expired: (await describe(did, expiredRentals)).map((item, i) => ({
          ...item,
          expiresAt: expiredRentals[i].expires_at,
        })),
      },
      subscriptions: {
        creators: subs
          .filter(s => s.target_type === 'creator')
          .map(subscription),
        studios: subs.filter(s => s.target_type === 'studio').map(subscription),
      },
      collections: await describe(did, collections),
      saved: await describe(did, saved),
      watchLater: await describe(did, later),
      history: hist,
    }
    const nonEmpty = (v: unknown): boolean =>
      Array.isArray(v)
        ? v.length > 0
        : typeof v === 'object' && v !== null && Object.values(v).some(nonEmpty)
    return {
      sections: Object.fromEntries(
        Object.entries(sections).filter(([, v]) => nonEmpty(v)),
      ),
    }
  })

  const listParams = z.object({
    list: z.enum(['saved', 'watch-later']),
    type: z.enum(LIBRARY_TYPES),
    id: z.string().min(1).max(500),
  })
  const tableFor = (list: 'saved' | 'watch-later') =>
    list === 'saved' ? 'library_saved' : 'library_watch_later'

  app.put('/me/library/:list/:type/:id', async req => {
    const did = await requireAdult(req)
    const p = listParams.parse(req.params)
    const resource = await resolveResource(db, {type: p.type, id: p.id})
    // Only real, currently published items can be added.
    if (!resource) throw notFound()
    if (resource.status !== 'published') throw badRequest('unavailable')
    await db.query(
      `insert into ${tableFor(p.list)} (user_did, resource_type, resource_id) values ($1, $2, $3)
       on conflict do nothing`,
      [did, p.type, p.id],
    )
    return {ok: true}
  })

  app.delete('/me/library/:list/:type/:id', async req => {
    const did = await ctx.user(req)
    const p = listParams.parse(req.params)
    await db.query(
      `delete from ${tableFor(p.list)} where user_did = $1 and resource_type = $2 and resource_id = $3`,
      [did, p.type, p.id],
    )
    return {ok: true}
  })
})
