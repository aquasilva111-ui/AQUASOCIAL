import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {assertAdultAccess, blockedDids} from '../entitlements/index.js'
import {badRequest, conflict} from '../lib/errors.js'
import {enforce, SharedRateLimiter} from '../lib/rateLimit.js'
import {registerRoutes} from '../registry.js'

const did = z.string().regex(/^did:(plc|web):[a-zA-Z0-9._:%-]{1,200}$/)
const MAX_RELATIONS = 5000
const SIGNAL_LIST_LIMIT = 200

/** Kinds a client may report. follow/mute/... are recorded by the server. */
const CLIENT_SIGNALS = ['view', 'like', 'save', 'search', 'hide'] as const

export type SignalKind =
  | (typeof CLIENT_SIGNALS)[number]
  | 'follow'
  | 'unfollow'
  | 'mute'
  | 'unmute'

/** Records a +18 signal unless the user switched signals off. */
export async function recordSignal(
  db: Queryable,
  userDid: string,
  kind: SignalKind,
  resource?: {type: string; id: string},
) {
  const [settings] = await db.query(
    `select signals_enabled, search_history_enabled from adult_privacy_settings where user_did = $1`,
    [userDid],
  )
  if (settings && !settings.signals_enabled) return false
  if (kind === 'search' && settings && !settings.search_history_enabled)
    return false
  await db.query(
    `insert into adult_signals (user_did, kind, resource_type, resource_id) values ($1, $2, $3, $4)`,
    [userDid, kind, resource?.type ?? null, resource?.id ?? null],
  )
  return true
}

registerRoutes(ctx => {
  const {app, db} = ctx
  const limiter = new SharedRateLimiter(db, 300, 3600_000)

  const requireAdult = async (req: Parameters<typeof ctx.user>[0]) => {
    const me = await ctx.user(req)
    await assertAdultAccess(db, me)
    return me
  }

  // follows and mutes share one shape: a private list of creator DIDs.
  for (const rel of [
    {
      path: 'follows',
      table: 'adult_follows',
      owner: 'follower_did',
      on: 'follow',
      off: 'unfollow',
    },
    {
      path: 'mutes',
      table: 'adult_mutes',
      owner: 'muter_did',
      on: 'mute',
      off: 'unmute',
    },
  ] as const) {
    app.get(`/me/adult/${rel.path}`, async req => {
      const me = await requireAdult(req)
      const rows = await db.query(
        `select creator_did, created_at from ${rel.table} where ${rel.owner} = $1 order by created_at desc limit ${MAX_RELATIONS}`,
        [me],
      )
      return {
        [rel.path]: rows.map(r => ({
          did: r.creator_did,
          createdAt: r.created_at,
        })),
      }
    })

    app.put(`/me/adult/${rel.path}/:did`, async req => {
      const me = await requireAdult(req)
      await enforce(limiter, `${rel.path}:${me}`)
      const {did: target} = z.object({did}).parse(req.params)
      if (target === me) throw badRequest('invalid_target')
      if (rel.path === 'follows' && (await blockedDids(db, me)).has(target))
        throw conflict('blocked')
      const [count] = await db.query(
        `select count(*)::int as n from ${rel.table} where ${rel.owner} = $1`,
        [me],
      )
      const inserted = await db.query(
        `insert into ${rel.table} (${rel.owner}, creator_did) values ($1, $2) on conflict do nothing returning 1`,
        [me, target],
      )
      if (inserted.length && count.n >= MAX_RELATIONS) {
        await db.query(
          `delete from ${rel.table} where ${rel.owner} = $1 and creator_did = $2`,
          [me, target],
        )
        throw conflict('limit_reached')
      }
      if (inserted.length)
        await recordSignal(db, me, rel.on, {type: 'creator', id: target})
      return {ok: true}
    })

    app.delete(`/me/adult/${rel.path}/:did`, async req => {
      const me = await requireAdult(req)
      await enforce(limiter, `${rel.path}:${me}`)
      const {did: target} = z.object({did}).parse(req.params)
      const removed = await db.query(
        `delete from ${rel.table} where ${rel.owner} = $1 and creator_did = $2 returning 1`,
        [me, target],
      )
      if (removed.length)
        await recordSignal(db, me, rel.off, {type: 'creator', id: target})
      return {ok: true}
    })
  }

  // ------------------------------------------------------------ privacy
  app.get('/me/adult/privacy', async req => {
    const me = await requireAdult(req)
    const [row] = await db.query(
      `select signals_enabled, search_history_enabled from adult_privacy_settings where user_did = $1`,
      [me],
    )
    return {
      signalsEnabled: row?.signals_enabled ?? true,
      searchHistoryEnabled: row?.search_history_enabled ?? true,
    }
  })

  app.put('/me/adult/privacy', async req => {
    const me = await requireAdult(req)
    const body = z
      .object({
        signalsEnabled: z.boolean().optional(),
        searchHistoryEnabled: z.boolean().optional(),
      })
      .parse(req.body)
    await db.query(
      `insert into adult_privacy_settings (user_did, signals_enabled, search_history_enabled)
       values ($1, coalesce($2, true), coalesce($3, true))
       on conflict (user_did) do update set
         signals_enabled = coalesce($2, adult_privacy_settings.signals_enabled),
         search_history_enabled = coalesce($3, adult_privacy_settings.search_history_enabled),
         updated_at = now()`,
      [me, body.signalsEnabled ?? null, body.searchHistoryEnabled ?? null],
    )
    // Turning a switch off also forgets what was already collected.
    if (body.signalsEnabled === false)
      await db.query(`delete from adult_signals where user_did = $1`, [me])
    else if (body.searchHistoryEnabled === false)
      await db.query(
        `delete from adult_signals where user_did = $1 and kind = 'search'`,
        [me],
      )
    return {ok: true}
  })

  // ------------------------------------------------------------ signals
  app.post('/me/adult/signals', async req => {
    const me = await requireAdult(req)
    await enforce(limiter, `signals:${me}`)
    const body = z
      .object({
        kind: z.enum(CLIENT_SIGNALS),
        resourceType: z.string().min(1).max(40).optional(),
        resourceId: z.string().min(1).max(200).optional(),
      })
      .parse(req.body)
    const recorded = await recordSignal(
      db,
      me,
      body.kind,
      body.resourceType && body.resourceId
        ? {type: body.resourceType, id: body.resourceId}
        : undefined,
    )
    return {recorded}
  })

  /** Private to the user, who can always see what was kept about them. */
  app.get('/me/adult/signals', async req => {
    const me = await requireAdult(req)
    const rows = await db.query(
      `select id::text as id, kind, resource_type, resource_id, created_at from adult_signals
        where user_did = $1 order by created_at desc, id desc limit ${SIGNAL_LIST_LIMIT}`,
      [me],
    )
    return {
      signals: rows.map(r => ({
        id: r.id,
        kind: r.kind,
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        createdAt: r.created_at,
      })),
    }
  })

  app.delete('/me/adult/signals', async req => {
    const me = await requireAdult(req)
    await db.query(`delete from adult_signals where user_did = $1`, [me])
    return {ok: true}
  })
})
