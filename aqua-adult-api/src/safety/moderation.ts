import {type Db, type Queryable} from '../db/index.js'
import {resolveResource} from '../entitlements/index.js'
import {audit} from '../lib/audit.js'
import {ApiError, badRequest, conflict, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'

/**
 * Trust & Safety core. Every change to a live item goes through
 * applyModerationAction(): it records the previous state, writes an
 * append-only moderation action and an audit event, and — for quarantine and
 * removal — also pulls the item's media, so signed URLs issued earlier stop
 * working at once (the Media Engine re-checks the asset on every file).
 */

export type ModerationAction =
  | 'restrict'
  | 'quarantine'
  | 'remove'
  | 'suspend'
  | 'ban'
  | 'restore'
  | 'age_restrict'
  | 'region_restrict'
  | 'revoke_creator'
  | 'lift_restriction'

export type CaseStatus =
  | 'OPEN'
  | 'REVIEWING'
  | 'ACTION_REQUIRED'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'ESCALATED'

export const OPEN_STATUSES: CaseStatus[] = [
  'OPEN',
  'REVIEWING',
  'ACTION_REQUIRED',
  'ESCALATED',
]

// ------------------------------------------------------------ status targets

type StatusTarget = {
  table: string
  /** Where clause selecting one row ($1 = id, $2 = resource type when composite). */
  where: string
  composite?: boolean
  quarantined: string
  removed: string
  assetColumns: string[]
}

/** Whitelisted tables/columns only — nothing here comes from the client. */
const STATUS_TARGETS: Record<string, StatusTarget> = {
  video: {
    table: 'videos',
    where: 'id = $1',
    quarantined: 'quarantined',
    removed: 'removed',
    assetColumns: ['media_asset_id', 'preview_asset_id', 'poster_asset_id'],
  },
  movie: {
    table: 'movies',
    where: 'id = $1',
    quarantined: 'quarantined',
    removed: 'removed',
    assetColumns: ['media_asset_id', 'preview_asset_id', 'poster_asset_id'],
  },
  series: {
    table: 'series',
    where: 'id = $1',
    quarantined: 'quarantined',
    removed: 'removed',
    assetColumns: ['poster_asset_id'],
  },
  season: {
    table: 'seasons',
    where: 'id = $1',
    quarantined: 'quarantined',
    removed: 'removed',
    assetColumns: [],
  },
  episode: {
    table: 'episodes',
    where: 'id = $1',
    quarantined: 'quarantined',
    removed: 'removed',
    assetColumns: ['media_asset_id', 'preview_asset_id'],
  },
  collection: {
    table: 'collections',
    where: 'id = $1',
    quarantined: 'quarantined',
    removed: 'removed',
    assetColumns: [],
  },
  live: {
    table: 'live_streams',
    where: 'id = $1',
    quarantined: 'QUARANTINED',
    removed: 'REMOVED',
    assetColumns: ['recording_asset_id'],
  },
  media: {
    table: 'media_assets',
    where: 'id = $1',
    quarantined: 'QUARANTINED',
    removed: 'REMOVED',
    assetColumns: [],
  },
}
// Social posts and comments (the +18 network core) keep their own status.
for (const [type, table] of [
  ['social_post', 'adult_posts'],
  ['social_comment', 'adult_comments'],
] as const)
  STATUS_TARGETS[type] = {
    table,
    where: 'id = $1',
    quarantined: 'quarantined',
    removed: 'removed',
    assetColumns: [],
  }
for (const type of ['post', 'image_set', 'audio'])
  STATUS_TARGETS[type] = {
    table: 'adult_resources',
    where: 'resource_id = $1 and resource_type = $2',
    composite: true,
    quarantined: 'quarantined',
    removed: 'removed',
    assetColumns: [],
  }

export const CONTENT_TYPES = [
  'video',
  'social_post',
  'social_comment',
  'post',
  'image_set',
  'audio',
  'movie',
  'series',
  'season',
  'episode',
  'collection',
]
export const PRODUCTION_TYPES = ['movie', 'series', 'season', 'episode']

/** Account-level targets and the table/column their status lives in. */
const ACCOUNT_TARGETS = ['creator', 'studio', 'user'] as const

async function loadStatus(tx: Queryable, type: string, id: string) {
  const t = STATUS_TARGETS[type]
  if (!t) return undefined
  const cols = ['status', ...t.assetColumns].join(', ')
  const [row] = await tx.query(
    `select ${cols} from ${t.table} where ${t.where}`,
    t.composite ? [id, type] : [id],
  )
  return row
}

async function setStatus(
  tx: Queryable,
  type: string,
  id: string,
  status: string,
) {
  const t = STATUS_TARGETS[type]
  await tx.query(
    `update ${t.table} set status = $${t.composite ? 3 : 2} where ${t.where}`,
    t.composite ? [id, type, status] : [id, status],
  )
}

// ------------------------------------------------------------ cases

export async function openCase(
  tx: Queryable,
  input: {
    source: string
    resourceType: string
    resourceId: string
    reasonCode?: string | null
    priority: number
    status?: CaseStatus
    parentCaseId?: string
  },
) {
  const id = newId('case')
  await tx.query(
    `insert into moderation_cases (id, source, resource_type, resource_id, reason_code, priority, status, parent_case_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.source,
      input.resourceType,
      input.resourceId,
      input.reasonCode ?? null,
      input.priority,
      input.status ?? 'OPEN',
      input.parentCaseId ?? null,
    ],
  )
  return id
}

export async function loadCase(db: Queryable, id: string) {
  const [c] = await db.query(`select * from moderation_cases where id = $1`, [
    id,
  ])
  if (!c) throw notFound()
  return c
}

export async function setCaseStatus(
  tx: Queryable,
  caseId: string,
  status: CaseStatus,
) {
  await tx.query(
    `update moderation_cases set status = $2, updated_at = now(),
       resolved_at = case when $2 in ('RESOLVED', 'DISMISSED') then now() else null end
     where id = $1`,
    [caseId, status],
  )
}

// ------------------------------------------------------------ reports

export type ReportTarget =
  | 'content'
  | 'creator'
  | 'user'
  | 'message'
  | 'live'
  | 'studio'
  | 'production'

/** Maps a report target onto a moderatable resource, and checks it exists. */
export async function resolveReportTarget(
  db: Queryable,
  target: ReportTarget,
  resourceType: string | undefined,
  resourceId: string,
): Promise<{type: string; id: string}> {
  const exists = async (sql: string) =>
    (await db.query(sql, [resourceId])).length > 0
  switch (target) {
    case 'content':
    case 'production': {
      const allowed = target === 'content' ? CONTENT_TYPES : PRODUCTION_TYPES
      if (!resourceType || !allowed.includes(resourceType))
        throw badRequest('invalid_target')
      if (!(await resolveResource(db, {type: resourceType, id: resourceId})))
        throw notFound()
      return {type: resourceType, id: resourceId}
    }
    case 'creator':
      if (!(await exists(`select 1 from creators where id = $1`)))
        throw notFound()
      return {type: 'creator', id: resourceId}
    case 'studio':
      if (!(await exists(`select 1 from studios where id = $1`)))
        throw notFound()
      return {type: 'studio', id: resourceId}
    case 'live':
      if (!(await exists(`select 1 from live_streams where id = $1`)))
        throw notFound()
      return {type: 'live', id: resourceId}
    case 'message':
      if (!(await exists(`select 1 from live_chat_messages where id = $1`)))
        throw notFound()
      return {type: 'live_message', id: resourceId}
    case 'user':
      if (!/^did:(plc|web):[a-zA-Z0-9._:%-]{1,200}$/.test(resourceId))
        throw badRequest('invalid_target')
      return {type: 'user', id: resourceId}
  }
}

/**
 * Files a report. Reports on the same item join one open case, whose
 * priority rises to the most severe reason. Reporters are never shown to
 * the reported party.
 */
export async function fileReport(
  db: Db,
  input: {
    reporterDid: string
    target: ReportTarget
    resource: {type: string; id: string}
    reasonCode: string
    details?: string
  },
) {
  const [reason] = await db.query(
    `select * from report_reasons where code = $1 and active`,
    [input.reasonCode],
  )
  if (!reason || !(reason.target_types as string[]).includes(input.target))
    throw badRequest('invalid_reason')
  if (reason.requires_details && !input.details?.trim())
    throw badRequest('details_required')
  const [dup] = await db.query(
    `select 1 from reports where reporter_did = $1 and resource_type = $2 and resource_id = $3
        and created_at > now() - interval '24 hours'`,
    [input.reporterDid, input.resource.type, input.resource.id],
  )
  if (dup) throw new ApiError(429, 'already_reported')
  const [recent] = await db.query(
    `select count(*)::int as n from reports where reporter_did = $1 and created_at > now() - interval '1 hour'`,
    [input.reporterDid],
  )
  if (recent.n >= 20) throw new ApiError(429, 'rate_limited')

  return db.transaction(async tx => {
    const [existing] = await tx.query(
      `select id, priority from moderation_cases
        where source = 'report' and resource_type = $1 and resource_id = $2
          and status in ('OPEN', 'REVIEWING', 'ACTION_REQUIRED', 'ESCALATED')
        for update`,
      [input.resource.type, input.resource.id],
    )
    let caseId: string
    if (existing) {
      caseId = existing.id
      await tx.query(
        `update moderation_cases set report_count = report_count + 1,
           priority = least(priority, $2), updated_at = now() where id = $1`,
        [caseId, reason.priority],
      )
    } else {
      caseId = await openCase(tx, {
        source: 'report',
        resourceType: input.resource.type,
        resourceId: input.resource.id,
        reasonCode: reason.code,
        priority: reason.priority,
        // The gravest categories skip the plain queue.
        status: reason.priority === 1 ? 'ACTION_REQUIRED' : 'OPEN',
      })
      await tx.query(
        `update moderation_cases set report_count = 1 where id = $1`,
        [caseId],
      )
    }
    const reportId = newId('rpt')
    await tx.query(
      `insert into reports (id, reporter_did, target_type, resource_type, resource_id, reason_code, details, case_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        reportId,
        input.reporterDid,
        input.target,
        input.resource.type,
        input.resource.id,
        reason.code,
        input.details?.trim() || null,
        caseId,
      ],
    )
    return {reportId, caseId}
  })
}

// ------------------------------------------------------------ actions

/** Which staff capability each action needs (see STAFF_PERMISSIONS). */
export const ACTION_PERMISSION: Record<
  ModerationAction,
  'actContent' | 'actRemove' | 'actAccount'
> = {
  restrict: 'actContent',
  quarantine: 'actContent',
  age_restrict: 'actContent',
  region_restrict: 'actContent',
  lift_restriction: 'actContent',
  remove: 'actRemove',
  restore: 'actRemove',
  suspend: 'actAccount',
  ban: 'actAccount',
  revoke_creator: 'actAccount',
}

const REVERSIBLE: ModerationAction[] = [
  'restrict',
  'quarantine',
  'remove',
  'suspend',
  'ban',
  'age_restrict',
  'region_restrict',
  'revoke_creator',
]

type ActionInput = {
  caseId: string
  action: ModerationAction
  resourceType: string
  resourceId: string
  actor: string
  reason: string
  params?: {regions?: string[]; restrictionId?: string; actionId?: string}
}

/** Applies one moderation action atomically. Returns the action id. */
export async function applyModerationAction(tx: Queryable, input: ActionInput) {
  const {action, resourceType: type, resourceId: id} = input
  let previous: Record<string, unknown> | null = null
  let reverses: string | null = null
  const params: Record<string, unknown> = {...(input.params ?? {})}

  switch (action) {
    case 'quarantine':
    case 'remove': {
      if (type === 'live_message') {
        if (action === 'quarantine') throw badRequest('unsupported_action')
        const [m] = await tx.query(
          `select deleted_at from live_chat_messages where id = $1`,
          [id],
        )
        if (!m) throw notFound()
        previous = {deletedAt: m.deleted_at}
        await tx.query(
          `update live_chat_messages set deleted_at = coalesce(deleted_at, now()) where id = $1`,
          [id],
        )
        break
      }
      const t = STATUS_TARGETS[type]
      if (!t) throw badRequest('unsupported_target')
      const row = await loadStatus(tx, type, id)
      if (!row) throw notFound()
      const assets: Record<string, string> = {}
      for (const col of t.assetColumns) {
        if (!row[col]) continue
        const [a] = await tx.query(
          `select status from media_assets where id = $1`,
          [row[col]],
        )
        if (a) assets[row[col]] = a.status
      }
      previous = {status: row.status, assets}
      await setStatus(
        tx,
        type,
        id,
        action === 'remove' ? t.removed : t.quarantined,
      )
      // Pull the media too: every signed URL minted before now stops working.
      const assetStatus = action === 'remove' ? 'REMOVED' : 'QUARANTINED'
      for (const assetId of Object.keys(assets))
        await tx.query(
          `update media_assets set status = $2, updated_at = now() where id = $1 and status <> 'REMOVED'`,
          [assetId, assetStatus],
        )
      if (type === 'live')
        await tx.query(
          `update live_streams set ended_at = coalesce(ended_at, now()) where id = $1`,
          [id],
        )
      break
    }
    case 'restrict':
    case 'age_restrict':
    case 'region_restrict': {
      const regions =
        action === 'region_restrict' ? (params.regions as string[]) : []
      if (
        action === 'region_restrict' &&
        (!Array.isArray(regions) ||
          !regions.length ||
          !regions.every(r => /^[A-Z]{2}$/.test(r)))
      )
        throw badRequest('regions_required')
      const restrictionId = newId('rst')
      await tx.query(
        `insert into moderation_restrictions (id, resource_type, resource_id, kind, regions, case_id, created_by)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [restrictionId, type, id, action, regions, input.caseId, input.actor],
      )
      previous = {restrictionId}
      break
    }
    case 'lift_restriction': {
      const rows = await tx.query(
        `update moderation_restrictions set active = false, lifted_at = now()
          where resource_type = $1 and resource_id = $2 and active
            and ($3::text is null or id = $3) returning id`,
        [type, id, (params.restrictionId as string) ?? null],
      )
      if (!rows.length) throw conflict('no_active_restriction')
      params.lifted = rows.map(r => r.id)
      break
    }
    case 'suspend':
    case 'revoke_creator': {
      if (type === 'creator') {
        const [c] = await tx.query(
          `select status, subscriptions_enabled from creators where id = $1`,
          [id],
        )
        if (!c) throw notFound()
        previous = {
          status: c.status,
          subscriptionsEnabled: c.subscriptions_enabled,
        }
        await tx.query(
          `update creators set status = $2,
             subscriptions_enabled = case when $2 = 'rejected' then false else subscriptions_enabled end
           where id = $1`,
          [id, action === 'suspend' ? 'suspended' : 'rejected'],
        )
      } else if (type === 'studio' && action === 'suspend') {
        const [s] = await tx.query(
          `select verification_status from studios where id = $1`,
          [id],
        )
        if (!s) throw notFound()
        previous = {status: s.verification_status}
        await tx.query(
          `update studios set verification_status = 'suspended' where id = $1`,
          [id],
        )
      } else throw badRequest('unsupported_target')
      break
    }
    case 'ban': {
      if (type !== 'user') throw badRequest('unsupported_target')
      const [acct] = await tx.query(
        `select banned_at from adult_accounts where did = $1`,
        [id],
      )
      const [creator] = await tx.query(
        `select id, status from creators where did = $1`,
        [id],
      )
      previous = {
        bannedAt: acct?.banned_at ?? null,
        creator: creator ? {id: creator.id, status: creator.status} : null,
      }
      await tx.query(
        `insert into adult_accounts (did, banned_at, ban_case_id) values ($1, now(), $2)
         on conflict (did) do update set banned_at = now(), ban_case_id = $2`,
        [id, input.caseId],
      )
      if (creator)
        await tx.query(
          `update creators set status = 'suspended' where id = $1`,
          [creator.id],
        )
      break
    }
    case 'restore': {
      const target = params.actionId
        ? await specificReversible(tx, params.actionId as string, type, id)
        : await lastReversible(tx, type, id)
      if (!target) throw conflict('nothing_to_restore')
      reverses = target.id
      await reverse(tx, target)
      break
    }
  }

  const actionId = newId('act')
  await tx.query(
    `insert into moderation_actions (id, case_id, action, resource_type, resource_id, actor_did, reason, params,
                                     previous_state, reverses_action_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      actionId,
      input.caseId,
      action,
      type,
      id,
      input.actor,
      input.reason,
      JSON.stringify(params),
      previous ? JSON.stringify(previous) : null,
      reverses,
    ],
  )
  await audit(tx, {
    actor: input.actor,
    action: `moderation.${action}`,
    resourceType: type,
    resourceId: id,
    reason: `${input.caseId}: ${input.reason}`.slice(0, 1000),
    result: 'ok',
  })
  return actionId
}

/** Latest reversible action on the item that nothing has reversed yet. */
async function lastReversible(tx: Queryable, type: string, id: string) {
  const [row] = await tx.query(
    `select a.* from moderation_actions a
      where a.resource_type = $1 and a.resource_id = $2 and a.action = any($3)
        and not exists (select 1 from moderation_actions r where r.reverses_action_id = a.id)
      order by a.created_at desc, a.id desc limit 1`,
    [type, id, REVERSIBLE],
  )
  return row
}

async function specificReversible(
  tx: Queryable,
  actionId: string,
  type: string,
  id: string,
) {
  const [row] = await tx.query(
    `select a.* from moderation_actions a
      where a.id = $1 and a.resource_type = $2 and a.resource_id = $3 and a.action = any($4)
        and not exists (select 1 from moderation_actions r where r.reverses_action_id = a.id)`,
    [actionId, type, id, REVERSIBLE],
  )
  return row
}

async function reverse(tx: Queryable, a: any) {
  const prev = a.previous_state ?? {}
  switch (a.action as ModerationAction) {
    case 'quarantine':
    case 'remove': {
      if (a.resource_type === 'live_message') {
        await tx.query(
          `update live_chat_messages set deleted_at = $2 where id = $1`,
          [a.resource_id, prev.deletedAt ?? null],
        )
        return
      }
      await setStatus(tx, a.resource_type, a.resource_id, prev.status)
      for (const [assetId, status] of Object.entries(
        (prev.assets ?? {}) as Record<string, string>,
      ))
        await tx.query(
          `update media_assets set status = $2, updated_at = now() where id = $1`,
          [assetId, status],
        )
      return
    }
    case 'restrict':
    case 'age_restrict':
    case 'region_restrict':
      await tx.query(
        `update moderation_restrictions set active = false, lifted_at = now() where id = $1 and active`,
        [prev.restrictionId],
      )
      return
    case 'suspend':
    case 'revoke_creator':
      if (a.resource_type === 'creator')
        await tx.query(
          `update creators set status = $2, subscriptions_enabled = coalesce($3, subscriptions_enabled) where id = $1`,
          [a.resource_id, prev.status, prev.subscriptionsEnabled ?? null],
        )
      else
        await tx.query(
          `update studios set verification_status = $2 where id = $1`,
          [a.resource_id, prev.status],
        )
      return
    case 'ban':
      await tx.query(
        `update adult_accounts set banned_at = $2, ban_case_id = case when $2::timestamptz is null then null else ban_case_id end
          where did = $1`,
        [a.resource_id, prev.bannedAt ?? null],
      )
      if (prev.creator)
        await tx.query(`update creators set status = $2 where id = $1`, [
          prev.creator.id,
          prev.creator.status,
        ])
      return
  }
}

export async function recordDecision(
  tx: Queryable,
  input: {
    caseId: string
    decision: string
    actor: string
    reason: string
    appealId?: string
  },
) {
  const id = newId('dec')
  await tx.query(
    `insert into moderation_decisions (id, case_id, decision, actor_did, reason, appeal_id)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      input.caseId,
      input.decision,
      input.actor,
      input.reason,
      input.appealId ?? null,
    ],
  )
  await audit(tx, {
    actor: input.actor,
    action: `moderation.decision.${input.decision}`,
    resourceType: 'case',
    resourceId: input.caseId,
    reason: input.reason.slice(0, 1000),
    result: 'ok',
  })
  return id
}

/** DIDs that own/answer for a moderated item (who may appeal). */
export async function responsibleDids(
  db: Queryable,
  type: string,
  id: string,
): Promise<string[]> {
  if (type === 'user') return [id]
  if (type === 'creator')
    return (await db.query(`select did from creators where id = $1`, [id])).map(
      r => r.did,
    )
  if (type === 'studio')
    return (
      await db.query(
        `select member_did from studio_members where studio_id = $1 and role in ('OWNER', 'ADMIN')`,
        [id],
      )
    ).map(r => r.member_did)
  if (type === 'live_message')
    return (
      await db.query(
        `select author_did from live_chat_messages where id = $1`,
        [id],
      )
    ).map(r => r.author_did)
  if (type === 'media')
    return (
      await db.query(`select owner_did from media_assets where id = $1`, [id])
    ).map(r => r.owner_did)
  const resource = await resolveResource(db, {type, id})
  return resource?.ownerDids ?? []
}

export {ACCOUNT_TARGETS}
