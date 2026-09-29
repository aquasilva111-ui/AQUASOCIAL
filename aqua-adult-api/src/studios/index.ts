import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {registerSellerAuthorizer} from '../economy/index.js'
import {ledgerSummary} from '../economy/index.js'
import {
  assertAdultAccess,
  checkAccess,
  type ProtectedResource,
  registerResourceResolver,
  type ResourceRef,
} from '../entitlements/index.js'
import {badRequest, conflict, forbidden, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {registerRoutes} from '../registry.js'
import {assertOwnTier, recordWatch} from '../views/index.js'

export type StudioRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'ANALYST' | 'MODERATOR'

/** What each capability requires. Checked on the server for every call. */
export const PERMISSIONS = {
  manageTeam: ['OWNER', 'ADMIN'],
  viewTeam: ['OWNER', 'ADMIN'],
  sell: ['OWNER', 'ADMIN'],
  editTitles: ['OWNER', 'ADMIN', 'EDITOR'],
  viewContent: ['OWNER', 'ADMIN', 'EDITOR', 'MODERATOR'],
  viewRevenue: ['OWNER', 'ADMIN', 'ANALYST'],
  viewAnalytics: ['OWNER', 'ADMIN', 'ANALYST'],
  viewSafety: ['OWNER', 'ADMIN', 'MODERATOR'],
  // Money leaving the studio is the owner's call alone.
  managePayouts: ['OWNER'],
} as const satisfies Record<string, StudioRole[]>

export type StudioPermission = keyof typeof PERMISSIONS

/** The capabilities a role holds — shown in the UI, enforced per route. */
export function permissionsFor(role: StudioRole): StudioPermission[] {
  return (Object.keys(PERMISSIONS) as StudioPermission[]).filter(p =>
    (PERMISSIONS[p] as readonly string[]).includes(role),
  )
}

export async function studioRole(db: Queryable, studioId: string, did: string) {
  const [row] = await db.query(
    `select m.role, s.verification_status from studio_members m join studios s on s.id = m.studio_id
      where m.studio_id = $1 and m.member_did = $2`,
    [studioId, did],
  )
  return row as {role: StudioRole; verification_status: string} | undefined
}

export async function requireStudioPermission(
  db: Queryable,
  studioId: string,
  did: string,
  permission: keyof typeof PERMISSIONS,
) {
  const row = await studioRole(db, studioId, did)
  if (
    !row ||
    !(PERMISSIONS[permission] as readonly string[]).includes(row.role)
  )
    throw forbidden('insufficient_role')
  return row
}

registerSellerAuthorizer('studio', async (db, did, studioId) => {
  const row = await studioRole(db, studioId, did)
  return (
    !!row &&
    row.verification_status === 'verified' &&
    PERMISSIONS.sell.includes(row.role as 'OWNER')
  )
})

// ------------------------------------------------------------ resolvers

const STATUS_RANK = [
  'removed',
  'quarantined',
  'unavailable',
  'archived',
  'draft',
  'scheduled',
  'published',
]
/** The most restrictive status in a hierarchy wins (removed series = removed episode). */
function worst(...statuses: (string | null | undefined)[]) {
  return statuses
    .filter((s): s is string => !!s)
    .sort(
      (x, y) => STATUS_RANK.indexOf(x) - STATUS_RANK.indexOf(y),
    )[0] as ProtectedResource['status']
}

async function teamDids(db: Queryable, studioId: string) {
  const rows = await db.query(
    `select member_did from studio_members where studio_id = $1 and role = any($2)`,
    [studioId, PERMISSIONS.editTitles],
  )
  return rows.map(r => r.member_did as string)
}

async function collectionScopes(
  db: Queryable,
  refs: ResourceRef[],
): Promise<ResourceRef[]> {
  if (!refs.length) return []
  const rows = await db.query(
    `select distinct ci.collection_id from collection_items ci
       join collections c on c.id = ci.collection_id and c.status = 'published'
       join unnest($1::text[], $2::text[]) as r(type, id) on ci.item_type = r.type and ci.item_id = r.id`,
    [refs.map(r => r.type), refs.map(r => r.id)],
  )
  return rows.map(r => ({type: 'collection', id: r.collection_id}))
}

const date = (v: unknown) => (v ? new Date(v as string) : null)
const laterOf = (a: Date | null, b: Date | null) =>
  !a ? b : !b ? a : a > b ? a : b
const earlierOf = (a: Date | null, b: Date | null) =>
  !a ? b : !b ? a : a < b ? a : b

async function mediaStatus(db: Queryable, assetId: string | null) {
  if (!assetId) return 'unavailable'
  const [a] = await db.query(`select status from media_assets where id = $1`, [
    assetId,
  ])
  return a?.status === 'QUARANTINED'
    ? 'quarantined'
    : a?.status === 'REMOVED'
      ? 'removed'
      : a?.status === 'READY'
        ? 'published'
        : 'unavailable'
}

async function studioStatus(db: Queryable, studioId: string) {
  const [s] = await db.query(
    `select verification_status from studios where id = $1`,
    [studioId],
  )
  return s?.verification_status
}

registerResourceResolver('movie', async (db, id) => {
  const [m] = await db.query(`select * from movies where id = $1`, [id])
  if (!m) return undefined
  const ref = {type: 'movie', id}
  return {
    ...ref,
    policy: m.access_policy,
    requiredTierId: m.required_tier_id,
    status: worst(m.status, await mediaStatus(db, m.media_asset_id)),
    ownerDids: await teamDids(db, m.studio_id),
    creatorSuspended: (await studioStatus(db, m.studio_id)) === 'suspended',
    availableFrom: date(m.availability_start),
    availableUntil: date(m.availability_end),
    allowedRegions: m.allowed_regions,
    scopes: [
      {type: 'studio', id: m.studio_id},
      ...(await collectionScopes(db, [ref])),
    ],
  }
})

async function loadSeries(db: Queryable, id: string) {
  const [s] = await db.query(`select * from series where id = $1`, [id])
  return s
}

registerResourceResolver('series', async (db, id) => {
  const s = await loadSeries(db, id)
  if (!s) return undefined
  const ref = {type: 'series', id}
  return {
    ...ref,
    policy: s.access_policy,
    requiredTierId: s.required_tier_id,
    status: s.status,
    ownerDids: await teamDids(db, s.studio_id),
    creatorSuspended: (await studioStatus(db, s.studio_id)) === 'suspended',
    availableFrom: date(s.availability_start),
    availableUntil: date(s.availability_end),
    allowedRegions: s.allowed_regions,
    scopes: [
      {type: 'studio', id: s.studio_id},
      ...(await collectionScopes(db, [ref])),
    ],
  }
})

registerResourceResolver('season', async (db, id) => {
  const [se] = await db.query(`select * from seasons where id = $1`, [id])
  if (!se) return undefined
  const s = await loadSeries(db, se.series_id)
  const refs = [
    {type: 'season', id},
    {type: 'series', id: s.id},
  ]
  return {
    type: 'season',
    id,
    policy: se.access_policy ?? s.access_policy,
    requiredTierId: s.required_tier_id,
    status: worst(se.status, s.status),
    ownerDids: await teamDids(db, s.studio_id),
    creatorSuspended: (await studioStatus(db, s.studio_id)) === 'suspended',
    availableFrom: date(s.availability_start),
    availableUntil: date(s.availability_end),
    allowedRegions: s.allowed_regions,
    scopes: [
      {type: 'studio', id: s.studio_id},
      {type: 'series', id: s.id},
      ...(await collectionScopes(db, refs)),
    ],
  }
})

registerResourceResolver('episode', async (db, id) => {
  const [e] = await db.query(
    `select e.*, se.id as season_id, se.access_policy as season_policy, se.status as season_status
       from episodes e join seasons se on se.id = e.season_id where e.id = $1`,
    [id],
  )
  if (!e) return undefined
  const s = await loadSeries(
    db,
    (
      await db.query(`select series_id from seasons where id = $1`, [
        e.season_id,
      ])
    )[0].series_id,
  )
  const refs = [
    {type: 'episode', id},
    {type: 'season', id: e.season_id},
    {type: 'series', id: s.id},
  ]
  return {
    type: 'episode',
    id,
    policy: e.access_policy ?? e.season_policy ?? s.access_policy,
    requiredTierId: e.required_tier_id ?? s.required_tier_id,
    status: worst(
      e.status,
      e.season_status,
      s.status,
      await mediaStatus(db, e.media_asset_id),
    ),
    ownerDids: await teamDids(db, s.studio_id),
    creatorSuspended: (await studioStatus(db, s.studio_id)) === 'suspended',
    availableFrom: laterOf(
      date(e.availability_start),
      date(s.availability_start),
    ),
    availableUntil: earlierOf(
      date(e.availability_end),
      date(s.availability_end),
    ),
    allowedRegions: s.allowed_regions,
    scopes: [
      {type: 'studio', id: s.studio_id},
      {type: 'series', id: s.id},
      {type: 'season', id: e.season_id},
      ...(await collectionScopes(db, refs)),
    ],
  }
})

registerResourceResolver('collection', async (db, id) => {
  const [c] = await db.query(`select * from collections where id = $1`, [id])
  if (!c) return undefined
  const owners =
    c.owner_type === 'studio'
      ? await teamDids(db, c.owner_id)
      : (
          await db.query(`select did from creators where id = $1`, [c.owner_id])
        ).map(r => r.did)
  return {
    type: 'collection',
    id,
    policy: c.access_policy,
    status: c.status,
    ownerDids: owners,
    scopes: [{type: c.owner_type, id: c.owner_id}],
  }
})

// ------------------------------------------------------------ routes

const POLICIES = [
  'free',
  'follower_only',
  'subscriber_only',
  'tier_required',
  'ppv_required',
  'purchase_required',
  'rental_required',
] as const
const TITLE_STATUS = [
  'draft',
  'scheduled',
  'published',
  'unavailable',
  'archived',
] as const
const release = {
  releaseDate: z.string().date().optional(),
  availabilityStart: z.string().datetime().optional(),
  availabilityEnd: z.string().datetime().optional(),
  allowedRegions: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(250)
    .optional(),
}

registerRoutes(ctx => {
  const {app, db, media} = ctx

  const requireAdult = async (req: Parameters<typeof ctx.user>[0]) => {
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    return did
  }

  async function ownedAsset(did: string, id: string | undefined, kind: string) {
    if (!id) return
    const [a] = await db.query(
      `select kind from media_assets where id = $1 and owner_did = $2`,
      [id, did],
    )
    if (!a || a.kind !== kind) throw badRequest('invalid_asset')
  }

  async function assertCanPublish(
    studioId: string,
    assetIds: (string | null | undefined)[],
  ) {
    if ((await studioStatus(db, studioId)) !== 'verified')
      throw forbidden('studio_not_verified')
    for (const id of assetIds.filter(Boolean)) {
      const [a] = await db.query(
        `select status from media_assets where id = $1`,
        [id],
      )
      if (a?.status !== 'READY') throw conflict('media_not_ready')
    }
  }

  // ------------------------------------------------------------ studio + team
  app.post('/studios', async req => {
    const did = await requireAdult(req)
    const body = z
      .object({
        name: z.string().min(1).max(100),
        handle: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
        description: z.string().max(5000).optional(),
      })
      .parse(req.body)
    const id = newId('std')
    await db.transaction(async tx => {
      const [taken] = await tx.query(
        `select 1 from studios where handle = $1`,
        [body.handle],
      )
      if (taken) throw conflict('handle_taken')
      await tx.query(
        `insert into studios (id, owner_did, name, handle, description) values ($1, $2, $3, $4, $5)`,
        [id, did, body.name, body.handle, body.description ?? null],
      )
      await tx.query(
        `insert into studio_members (studio_id, member_did, role) values ($1, $2, 'OWNER')`,
        [id, did],
      )
    })
    return {studioId: id}
  })

  /** Simulated studio verification — FASE 14 builds the real review. */
  app.post('/dev/studios/:id/verify', async req => {
    ctx.devOnly()
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await requireStudioPermission(db, id, did, 'manageTeam')
    await db.query(
      `update studios set verification_status = 'verified' where id = $1`,
      [id],
    )
    return {ok: true}
  })

  app.post('/studios/:id/members', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        did: z.string().regex(/^did:(plc|web):/),
        role: z.enum(['ADMIN', 'EDITOR', 'ANALYST', 'MODERATOR']),
      })
      .parse(req.body)
    const me = await requireStudioPermission(db, id, did, 'manageTeam')
    // Admins manage staff; only the owner appoints admins.
    if (body.role === 'ADMIN' && me.role !== 'OWNER')
      throw forbidden('insufficient_role')
    const existing = await studioRole(db, id, body.did)
    if (existing?.role === 'OWNER') throw forbidden('insufficient_role')
    if (existing?.role === 'ADMIN' && me.role !== 'OWNER')
      throw forbidden('insufficient_role')
    await db.query(
      `insert into studio_members (studio_id, member_did, role) values ($1, $2, $3)
       on conflict (studio_id, member_did) do update set role = excluded.role`,
      [id, body.did, body.role],
    )
    return {ok: true}
  })

  app.delete('/studios/:id/members/:did', async req => {
    const did = await ctx.user(req)
    const {id, did: target} = z
      .object({id: z.string(), did: z.string()})
      .parse(req.params)
    const me = await requireStudioPermission(db, id, did, 'manageTeam')
    const them = await studioRole(db, id, target)
    if (!them) throw notFound()
    if (them.role === 'OWNER' || (them.role === 'ADMIN' && me.role !== 'OWNER'))
      throw forbidden('insufficient_role')
    await db.query(
      `delete from studio_members where studio_id = $1 and member_did = $2`,
      [id, target],
    )
    return {ok: true}
  })

  // ------------------------------------------------------------ titles
  app.post('/studios/:id/movies', async req => {
    const did = await ctx.user(req)
    const {id: studioId} = z.object({id: z.string()}).parse(req.params)
    await requireStudioPermission(db, studioId, did, 'editTitles')
    const body = z
      .object({
        title: z.string().min(1).max(200),
        synopsis: z.string().max(5000).optional(),
        category: z.string().max(40).optional(),
        mediaAssetId: z.string(),
        previewAssetId: z.string().optional(),
        posterAssetId: z.string().optional(),
        accessPolicy: z.enum(POLICIES),
        requiredTierId: z.string().optional(),
        status: z.enum(TITLE_STATUS).default('draft'),
        ...release,
      })
      .parse(req.body)
    await ownedAsset(did, body.mediaAssetId, 'video')
    await ownedAsset(did, body.previewAssetId, 'video')
    await ownedAsset(did, body.posterAssetId, 'image')
    if (body.accessPolicy === 'tier_required')
      await assertOwnTier(db, 'studio', studioId, body.requiredTierId)
    if (body.status === 'published')
      await assertCanPublish(studioId, [body.mediaAssetId])
    const id = newId('mov')
    await db.query(
      `insert into movies (id, studio_id, media_asset_id, preview_asset_id, poster_asset_id, title, synopsis, category,
         access_policy, required_tier_id, status, release_date, availability_start, availability_end, allowed_regions)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        studioId,
        body.mediaAssetId,
        body.previewAssetId ?? null,
        body.posterAssetId ?? null,
        body.title,
        body.synopsis ?? null,
        body.category ?? null,
        body.accessPolicy,
        body.accessPolicy === 'tier_required' ? body.requiredTierId : null,
        body.status,
        body.releaseDate ?? null,
        body.availabilityStart ?? null,
        body.availabilityEnd ?? null,
        body.allowedRegions ?? [],
      ],
    )
    return {movieId: id}
  })

  app.post('/studios/:id/series', async req => {
    const did = await ctx.user(req)
    const {id: studioId} = z.object({id: z.string()}).parse(req.params)
    await requireStudioPermission(db, studioId, did, 'editTitles')
    const body = z
      .object({
        title: z.string().min(1).max(200),
        synopsis: z.string().max(5000).optional(),
        category: z.string().max(40).optional(),
        accessPolicy: z.enum(POLICIES),
        requiredTierId: z.string().optional(),
        status: z.enum(TITLE_STATUS).default('draft'),
        availabilityStart: release.availabilityStart,
        availabilityEnd: release.availabilityEnd,
        allowedRegions: release.allowedRegions,
      })
      .parse(req.body)
    if (body.accessPolicy === 'tier_required')
      await assertOwnTier(db, 'studio', studioId, body.requiredTierId)
    if (body.status === 'published') await assertCanPublish(studioId, [])
    const id = newId('ser')
    await db.query(
      `insert into series (id, studio_id, title, synopsis, category, access_policy, required_tier_id, status,
         availability_start, availability_end, allowed_regions)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        studioId,
        body.title,
        body.synopsis ?? null,
        body.category ?? null,
        body.accessPolicy,
        body.accessPolicy === 'tier_required' ? body.requiredTierId : null,
        body.status,
        body.availabilityStart ?? null,
        body.availabilityEnd ?? null,
        body.allowedRegions ?? [],
      ],
    )
    return {seriesId: id}
  })

  app.post('/series/:id/seasons', async req => {
    const did = await ctx.user(req)
    const {id: seriesId} = z.object({id: z.string()}).parse(req.params)
    const s = await loadSeries(db, seriesId)
    if (!s) throw notFound()
    await requireStudioPermission(db, s.studio_id, did, 'editTitles')
    const body = z
      .object({
        number: z.number().int().positive(),
        title: z.string().max(200).optional(),
        accessPolicy: z.enum(POLICIES).optional(),
        status: z.enum(TITLE_STATUS).default('draft'),
      })
      .parse(req.body)
    const id = newId('sea')
    await db.query(
      `insert into seasons (id, series_id, number, title, access_policy, status) values ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        seriesId,
        body.number,
        body.title ?? null,
        body.accessPolicy ?? null,
        body.status,
      ],
    )
    return {seasonId: id}
  })

  app.post('/seasons/:id/episodes', async req => {
    const did = await ctx.user(req)
    const {id: seasonId} = z.object({id: z.string()}).parse(req.params)
    const [se] = await db.query(
      `select se.*, s.studio_id from seasons se join series s on s.id = se.series_id where se.id = $1`,
      [seasonId],
    )
    if (!se) throw notFound()
    await requireStudioPermission(db, se.studio_id, did, 'editTitles')
    const body = z
      .object({
        number: z.number().int().positive(),
        title: z.string().min(1).max(200),
        synopsis: z.string().max(5000).optional(),
        mediaAssetId: z.string(),
        previewAssetId: z.string().optional(),
        accessPolicy: z.enum(POLICIES).optional(),
        requiredTierId: z.string().optional(),
        status: z.enum(TITLE_STATUS).default('draft'),
        releaseDate: release.releaseDate,
        availabilityStart: release.availabilityStart,
        availabilityEnd: release.availabilityEnd,
      })
      .parse(req.body)
    await ownedAsset(did, body.mediaAssetId, 'video')
    await ownedAsset(did, body.previewAssetId, 'video')
    if (body.accessPolicy === 'tier_required' || body.requiredTierId)
      await assertOwnTier(db, 'studio', se.studio_id, body.requiredTierId)
    if (body.status === 'published')
      await assertCanPublish(se.studio_id, [body.mediaAssetId])
    const id = newId('epi')
    await db.query(
      `insert into episodes (id, season_id, number, title, synopsis, media_asset_id, preview_asset_id, access_policy,
         required_tier_id, status, release_date, availability_start, availability_end)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        seasonId,
        body.number,
        body.title,
        body.synopsis ?? null,
        body.mediaAssetId,
        body.previewAssetId ?? null,
        body.accessPolicy ?? null,
        body.requiredTierId ?? null,
        body.status,
        body.releaseDate ?? null,
        body.availabilityStart ?? null,
        body.availabilityEnd ?? null,
      ],
    )
    return {episodeId: id}
  })

  const TITLE_TABLES = {
    movie: 'movies',
    series: 'series',
    season: 'seasons',
    episode: 'episodes',
  } as const
  async function titleStudio(
    type: keyof typeof TITLE_TABLES,
    id: string,
    q: Queryable = db,
  ): Promise<string | undefined> {
    const sql = {
      movie: `select studio_id from movies where id = $1`,
      series: `select studio_id from series where id = $1`,
      season: `select s.studio_id from seasons se join series s on s.id = se.series_id where se.id = $1`,
      episode: `select s.studio_id from episodes e join seasons se on se.id = e.season_id join series s on s.id = se.series_id where e.id = $1`,
    }[type]
    return (await q.query(sql, [id]))[0]?.studio_id
  }

  app.patch('/studio-titles/:type/:id', async req => {
    const did = await ctx.user(req)
    const p = z
      .object({
        type: z.enum(['movie', 'series', 'season', 'episode']),
        id: z.string(),
      })
      .parse(req.params)
    const body = z
      .object({
        status: z.enum(TITLE_STATUS).optional(),
        accessPolicy: z.enum(POLICIES).optional(),
        requiredTierId: z.string().optional(),
        title: z.string().min(1).max(200).optional(),
        synopsis: z.string().max(5000).optional(),
        // Releases: null clears a date/window.
        releaseDate: z.string().date().nullable().optional(),
        availabilityStart: z.string().datetime().nullable().optional(),
        availabilityEnd: z.string().datetime().nullable().optional(),
        allowedRegions: release.allowedRegions,
      })
      .parse(req.body)
    const studioId = await titleStudio(p.type, p.id)
    if (!studioId) throw notFound()
    await requireStudioPermission(db, studioId, did, 'editTitles')
    const table = TITLE_TABLES[p.type]
    const [row] = await db.query(`select * from ${table} where id = $1`, [p.id])
    if (row.status === 'quarantined' || row.status === 'removed')
      throw forbidden('under_moderation')
    if (body.status === 'published')
      await assertCanPublish(studioId, [row.media_asset_id])

    // Columns each level actually has (seasons inherit most of the series).
    const columns: Record<string, string[]> = {
      movie: [
        'title',
        'synopsis',
        'required_tier_id',
        'release_date',
        'availability_start',
        'availability_end',
        'allowed_regions',
      ],
      series: [
        'title',
        'synopsis',
        'required_tier_id',
        'availability_start',
        'availability_end',
        'allowed_regions',
      ],
      season: ['title'],
      episode: [
        'title',
        'synopsis',
        'required_tier_id',
        'release_date',
        'availability_start',
        'availability_end',
      ],
    }
    const has = (c: string) => columns[p.type].includes(c)
    const sets: [string, unknown][] = []
    if (body.status) sets.push(['status', body.status])
    if (body.accessPolicy) sets.push(['access_policy', body.accessPolicy])
    const policy = body.accessPolicy ?? row.access_policy
    if (has('required_tier_id') && (body.accessPolicy || body.requiredTierId)) {
      const tierId =
        body.requiredTierId ??
        (body.accessPolicy ? undefined : row.required_tier_id)
      if (policy === 'tier_required' || body.requiredTierId)
        await assertOwnTier(db, 'studio', studioId, tierId)
      sets.push([
        'required_tier_id',
        policy === 'tier_required' || p.type === 'episode' ? tierId : null,
      ])
    }
    const optional: [keyof typeof body, string][] = [
      ['title', 'title'],
      ['synopsis', 'synopsis'],
      ['releaseDate', 'release_date'],
      ['availabilityStart', 'availability_start'],
      ['availabilityEnd', 'availability_end'],
      ['allowedRegions', 'allowed_regions'],
    ]
    for (const [key, column] of optional) {
      if (body[key] === undefined) continue
      if (!has(column)) throw badRequest(`not_applicable_${key}`)
      sets.push([column, body[key]])
    }
    const start =
      body.availabilityStart !== undefined
        ? body.availabilityStart
        : row.availability_start
    const end =
      body.availabilityEnd !== undefined
        ? body.availabilityEnd
        : row.availability_end
    if (start && end && new Date(start) >= new Date(end))
      throw badRequest('invalid_availability_window')
    if (!sets.length) return {ok: true}
    await db.query(
      `update ${table} set ${sets.map(([c], i) => `${c} = $${i + 2}`).join(', ')} where id = $1`,
      [p.id, ...sets.map(([, v]) => v ?? null)],
    )
    return {ok: true}
  })

  // ------------------------------------------------------------ collections + credits
  app.post('/studios/:id/collections', async req => {
    const did = await ctx.user(req)
    const {id: studioId} = z.object({id: z.string()}).parse(req.params)
    await requireStudioPermission(db, studioId, did, 'editTitles')
    const body = z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
        accessPolicy: z
          .enum([
            'free',
            'subscriber_only',
            'purchase_required',
            'ppv_required',
            'rental_required',
          ])
          .default('free'),
        status: z.enum(['draft', 'published']).default('draft'),
        items: z
          .array(
            z.object({
              type: z.enum(['movie', 'series', 'season', 'episode']),
              id: z.string(),
            }),
          )
          .max(500)
          .default([]),
      })
      .parse(req.body)
    const id = newId('col')
    await db.transaction(async tx => {
      await tx.query(
        `insert into collections (id, owner_type, owner_id, title, description, access_policy, status)
         values ($1, 'studio', $2, $3, $4, $5, $6)`,
        [
          id,
          studioId,
          body.title,
          body.description ?? null,
          body.accessPolicy,
          body.status,
        ],
      )
      for (const [i, item] of body.items.entries()) {
        // Only this studio's own titles may be bundled.
        if ((await titleStudio(item.type, item.id, tx)) !== studioId)
          throw badRequest('foreign_item')
        await tx.query(
          `insert into collection_items (collection_id, item_type, item_id, position) values ($1, $2, $3, $4)`,
          [id, item.type, item.id, i],
        )
      }
    })
    return {collectionId: id}
  })

  app.post('/studio-credits', async req => {
    const did = await ctx.user(req)
    const body = z
      .object({
        itemType: z.enum(['movie', 'series', 'episode']),
        itemId: z.string(),
        role: z.string().min(1).max(60),
        displayName: z.string().min(1).max(100),
        entityType: z.enum(['aqua_profile', 'external']),
        entityDid: z
          .string()
          .regex(/^did:(plc|web):/)
          .optional(),
      })
      .parse(req.body)
    const studioId = await titleStudio(body.itemType, body.itemId)
    if (!studioId) throw notFound()
    await requireStudioPermission(db, studioId, did, 'editTitles')
    await db.query(
      `insert into production_credits (id, item_type, item_id, role, display_name, entity_type, entity_did)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        newId('cred'),
        body.itemType,
        body.itemId,
        body.role,
        body.displayName,
        body.entityType,
        body.entityType === 'aqua_profile' ? (body.entityDid ?? null) : null,
      ],
    )
    return {ok: true}
  })

  app.get('/studios/:id/revenue', async req => {
    const did = await ctx.user(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await requireStudioPermission(db, id, did, 'viewRevenue')
    return {balances: await ledgerSummary(db, 'studio', id)}
  })

  // ------------------------------------------------------------ discovery (adult context)
  const posterUrl = (assetId: string | null) =>
    assetId
      ? media.authorize(assetId, 'thumbnail').then(
          r => r.url,
          () => null,
        )
      : Promise.resolve(null)

  const publishedMovies = `select m.*, st.handle as studio_handle, st.name as studio_name from movies m
      join studios st on st.id = m.studio_id and st.verification_status = 'verified'
      join media_assets a on a.id = m.media_asset_id and a.status = 'READY'
     where m.status = 'published'
       and (m.availability_start is null or m.availability_start <= now())
       and (m.availability_end is null or m.availability_end > now())`
  const publishedSeries = `select s.*, st.handle as studio_handle, st.name as studio_name from series s
      join studios st on st.id = s.studio_id and st.verification_status = 'verified'
     where s.status = 'published'`

  const movieCard = async (m: any) => ({
    type: 'movie',
    id: m.id,
    title: m.title,
    synopsis: m.synopsis,
    category: m.category,
    accessPolicy: m.access_policy,
    studio: {handle: m.studio_handle, name: m.studio_name},
    releaseDate: m.release_date,
    posterUrl: await posterUrl(m.poster_asset_id),
    hasPreview: !!m.preview_asset_id,
  })
  const seriesCard = async (s: any) => ({
    type: 'series',
    id: s.id,
    title: s.title,
    synopsis: s.synopsis,
    category: s.category,
    accessPolicy: s.access_policy,
    studio: {handle: s.studio_handle, name: s.studio_name},
    posterUrl: await posterUrl(s.poster_asset_id),
  })

  app.get('/studios', async req => {
    const did = await requireAdult(req)
    const [studios, movies, series, collections, subscribed, cont] =
      await Promise.all([
        db.query(
          `select id, name, handle, description from studios where verification_status = 'verified' order by created_at desc limit 20`,
        ),
        db.query(
          `${publishedMovies} order by coalesce(m.release_date, m.created_at::date) desc limit 24`,
        ),
        db.query(`${publishedSeries} order by s.created_at desc limit 24`),
        db.query(`select c.id, c.title, c.description, c.access_policy, st.handle as studio_handle from collections c
                  join studios st on st.id = c.owner_id and c.owner_type = 'studio' and st.verification_status = 'verified'
                 where c.status = 'published' order by c.created_at desc limit 12`),
        db.query(
          `select st.id, st.name, st.handle from subscriptions su join studios st on st.id = su.target_id
                 where su.subscriber_did = $1 and su.target_type = 'studio' and su.current_period_end > now()
                   and su.status in ('ACTIVE', 'PAST_DUE', 'CANCELLED')`,
          [did],
        ),
        db.query(
          `select resource_type, resource_id, position_ms, duration_ms from adult_watch_progress
                 where user_did = $1 and resource_type in ('movie', 'episode') order by updated_at desc limit 12`,
          [did],
        ),
      ])
    return {
      featuredStudios: studios,
      newReleases: await Promise.all(movies.map(movieCard)),
      series: await Promise.all(series.map(seriesCard)),
      collections,
      subscribedStudios: subscribed,
      continueWatching: cont,
    }
  })

  /** Adult Search Context only — never feeds the global AQUA search. */
  app.get('/studios/search', async req => {
    await requireAdult(req)
    const {q} = z.object({q: z.string().min(1).max(100)}).parse(req.query)
    const like = `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`
    const [studios, movies, series] = await Promise.all([
      db.query(
        `select id, name, handle from studios where verification_status = 'verified' and (name ilike $1 or handle ilike $1) limit 20`,
        [like],
      ),
      db.query(`${publishedMovies} and m.title ilike $1 limit 40`, [like]),
      db.query(`${publishedSeries} and s.title ilike $1 limit 40`, [like]),
    ])
    return {
      studios,
      movies: await Promise.all(movies.map(movieCard)),
      series: await Promise.all(series.map(seriesCard)),
    }
  })

  app.get('/studios/by-handle/:handle', async req => {
    await requireAdult(req)
    const {handle} = z.object({handle: z.string().max(40)}).parse(req.params)
    const [st] = await db.query(
      `select id, name, handle, description from studios where handle = $1 and verification_status = 'verified'`,
      [handle],
    )
    if (!st) throw notFound()
    const [movies, series, collections, tiers] = await Promise.all([
      db.query(
        `${publishedMovies} and m.studio_id = $1 order by m.created_at desc`,
        [st.id],
      ),
      db.query(
        `${publishedSeries} and s.studio_id = $1 order by s.created_at desc`,
        [st.id],
      ),
      db.query(
        `select id, title, description, access_policy from collections where owner_type = 'studio' and owner_id = $1 and status = 'published'`,
        [st.id],
      ),
      db.query(
        `select t.id, t.name, t.price_minor, t.currency, t.billing_period, o.id as offer_id from subscription_tiers t
                  join offers o on o.tier_id = t.id and o.active where t.owner_type = 'studio' and t.owner_id = $1 and t.active`,
        [st.id],
      ),
    ])
    return {
      studio: st,
      movies: await Promise.all(movies.map(movieCard)),
      series: await Promise.all(series.map(seriesCard)),
      collections,
      tiers: tiers.map(t => ({
        id: t.id,
        name: t.name,
        priceMinor: String(t.price_minor),
        currency: t.currency,
        billingPeriod: t.billing_period,
        offerId: t.offer_id,
      })),
    }
  })

  const offersFor = async (ref: ResourceRef) =>
    (
      await db.query(
        `select id, kind, price_minor, currency, access_hours from offers
        where resource_type = $1 and resource_id = $2 and active order by price_minor`,
        [ref.type, ref.id],
      )
    ).map(o => ({
      id: o.id,
      kind: o.kind,
      priceMinor: String(o.price_minor),
      currency: o.currency,
      accessHours: o.access_hours,
    }))

  const credits = (type: string, id: string) =>
    db.query(
      `select role, display_name from production_credits where item_type = $1 and item_id = $2 order by position, created_at`,
      [type, id],
    )

  app.get('/studio-titles/movie/:id', async req => {
    const did = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {decision, resource} = await checkAccess(db, did, {type: 'movie', id})
    if (
      !resource ||
      (resource.status !== 'published' && !resource.ownerDids.includes(did))
    )
      throw notFound()
    const [m] = await db.query(
      `select m.*, st.handle as studio_handle, st.name as studio_name from movies m join studios st on st.id = m.studio_id where m.id = $1`,
      [id],
    )
    return {
      title: await movieCard(m),
      access: decision,
      offers: await offersFor({type: 'movie', id}),
      credits: await credits('movie', id),
    }
  })

  app.get('/studio-titles/series/:id', async req => {
    const did = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {decision, resource} = await checkAccess(db, did, {
      type: 'series',
      id,
    })
    if (
      !resource ||
      (resource.status !== 'published' && !resource.ownerDids.includes(did))
    )
      throw notFound()
    const [s] = await db.query(
      `select s.*, st.handle as studio_handle, st.name as studio_name from series s join studios st on st.id = s.studio_id where s.id = $1`,
      [id],
    )
    const seasons = await db.query(
      `select id, number, title from seasons where series_id = $1 and status = 'published' order by number`,
      [id],
    )
    const episodes = await db.query<{
      id: string
      season_id: string
      number: number
      title: string
      synopsis: string | null
    }>(
      `select e.id, e.season_id, e.number, e.title, e.synopsis from episodes e join seasons se on se.id = e.season_id
        where se.series_id = $1 and e.status = 'published' and se.status = 'published' order by se.number, e.number`,
      [id],
    )
    const withAccess = await Promise.all(
      episodes.map(async e => ({
        ...e,
        access: (await checkAccess(db, did, {type: 'episode', id: e.id}))
          .decision,
      })),
    )
    return {
      title: await seriesCard(s),
      access: decision,
      offers: await offersFor({type: 'series', id}),
      seasons: await Promise.all(
        seasons.map(async se => ({
          ...se,
          offers: await offersFor({type: 'season', id: se.id}),
          episodes: withAccess.filter(e => e.season_id === se.id),
        })),
      ),
      credits: await credits('series', id),
    }
  })

  // ------------------------------------------------------------ playback (reuses the Media Engine)
  const PLAYABLE = z.object({
    type: z.enum(['movie', 'episode']),
    id: z.string(),
  })

  app.post('/studio-titles/:type/:id/playback', async req => {
    const did = await requireAdult(req)
    const p = PLAYABLE.parse(req.params)
    const {decision} = await checkAccess(db, did, p)
    if (!decision.allowed) throw forbidden(decision.reason)
    const [row] = await db.query(
      `select media_asset_id from ${p.type === 'movie' ? 'movies' : 'episodes'} where id = $1`,
      [p.id],
    )
    return media.authorize(
      row.media_asset_id,
      'hls',
      decision.via === 'grant' ? (decision.entitlementId ?? '') : '',
    )
  })

  app.post('/studio-titles/:type/:id/preview', async req => {
    await requireAdult(req)
    const p = PLAYABLE.parse(req.params)
    const [row] = await db.query(
      `select preview_asset_id, status from ${p.type === 'movie' ? 'movies' : 'episodes'} where id = $1`,
      [p.id],
    )
    if (!row?.preview_asset_id || row.status !== 'published') throw notFound()
    return media.authorize(row.preview_asset_id, 'hls')
  })

  app.post('/studio-titles/:type/:id/progress', async req => {
    const did = await requireAdult(req)
    const p = PLAYABLE.parse(req.params)
    const body = z
      .object({
        positionMs: z.number().int().min(0),
        durationMs: z.number().int().positive().optional(),
      })
      .parse(req.body)
    const {decision} = await checkAccess(db, did, p)
    if (!decision.allowed) throw forbidden(decision.reason)
    await recordWatch(
      db,
      did,
      p,
      body.positionMs,
      body.durationMs ?? null,
      async () => {
        await db.query(
          `update ${p.type === 'movie' ? 'movies' : 'episodes'} set view_count = view_count + 1 where id = $1`,
          [p.id],
        )
      },
    )
    return {ok: true}
  })
})
