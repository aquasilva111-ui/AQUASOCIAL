import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {assertAdultAccess} from '../entitlements/index.js'
import {audit} from '../lib/audit.js'
import {badRequest, conflict} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {registerRoutes} from '../registry.js'
import {openCase} from '../safety/moderation.js'

/**
 * Sentinel until an external hash-list provider (the same seam as
 * safety/matching.ts) is registered. A hit quarantines the item and it
 * never appears in the portal feed or the external index.
 */
export const QUARANTINE_CONTENT_HASH = 'hash:quarantine'

export type ScanOutcome = 'ok' | 'quarantine'

/** Moderation hook. Runs before publish and before an external page is indexed. */
export function scanBeforePublish(
  contentHash: string | undefined,
): ScanOutcome {
  if (contentHash === QUARANTINE_CONTENT_HASH) return 'quarantine'
  return 'ok'
}

const CONSENT_STATEMENT =
  'Todas as pessoas mostradas têm 18+ e consentiram com a gravação e a publicação.'

const publishBody = z.object({
  format: z.enum(['post', 'video', 'article', 'book', 'visionboard']),
  title: z.string().trim().min(3).max(200),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  visibility: z.enum(['aqua18', 'subscribers']).default('aqua18'),
  consent: z.literal(true),
  contentHash: z.string().max(200).optional(),
})

const prefsBody = z.object({
  blurThumbnails: z.boolean(),
  autoplayVideos: z.boolean(),
  hideFromMain: z.boolean(),
  confirmExternal: z.boolean(),
  formats: z.array(z.enum(['post', 'video', 'article', 'visionboard', 'web'])),
  categories: z.array(
    z.enum(['artistico', 'literatura', 'explicito', 'fetiche']),
  ),
  mutedWords: z.string().max(500),
})

function prefsFromRow(row: Record<string, unknown> | undefined) {
  return {
    blurThumbnails: row ? !!row.blur_thumbnails : true,
    autoplayVideos: row ? !!row.autoplay_videos : false,
    hideFromMain: row ? !!row.hide_from_main : true,
    confirmExternal: row ? !!row.confirm_external : true,
    formats: String(row?.formats ?? 'post,video,article,visionboard')
      .split(',')
      .filter(Boolean),
    categories: String(row?.categories ?? 'artistico,literatura')
      .split(',')
      .filter(Boolean),
    mutedWords: String(row?.muted_words ?? ''),
  }
}

async function holdForMatch(
  db: Queryable,
  resourceType: string,
  resourceId: string,
  hash: string,
) {
  const caseId = await openCase(db, {
    source: 'hash_match',
    resourceType,
    resourceId,
    reasonCode: 'hash_match',
    priority: 1,
    status: 'ACTION_REQUIRED',
  })
  await audit(db, {
    actor: null,
    action: 'portal.hash_match',
    resourceType,
    resourceId,
    reason: `${caseId}: stub:${hash}`.slice(0, 500),
    result: 'denied',
  })
  return caseId
}

registerRoutes(ctx => {
  const {app, db} = ctx

  app.get('/me/adult/status', async req => {
    const did = await ctx.user(req)
    const [row] = await db.query(
      `select age_gate_status, identity_verification_status, banned_at
         from adult_accounts where did = $1`,
      [did],
    )
    return {
      ageGateStatus: row?.banned_at
        ? 'denied'
        : (row?.age_gate_status ?? 'required'),
      // Providers such as gov.br, Serpro Datavalid and Yoti are not connected.
      identityVerificationStatus:
        row?.identity_verification_status ?? 'pending',
      providersConnected: false,
    }
  })

  app.get('/portal/feed', async req => {
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    const format = z
      .enum(['all', 'post', 'video', 'article', 'book', 'visionboard', 'web'])
      .parse((req.query as {format?: string}).format ?? 'all')
    const rows = await db.query(
      `select id, format, title, handle, likes, comments, duration, pinned, trending,
              categories, tags, adult, status
         from portal_items
        where status = 'published' and adult
          and ($1 = 'all' or format = $1 or ($1 = 'article' and format = 'book'))
        order by created_at desc`,
      [format === 'article' ? 'article' : format],
    )
    return {
      items: rows.map(row => ({
        ...row,
        adult: true,
        categories: String(row.categories).split(',').filter(Boolean),
        tags: String(row.tags).split(',').filter(Boolean),
      })),
    }
  })

  app.get('/portal/web', async req => {
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    const query = z
      .object({
        q: z.string().max(120).optional(),
        category: z.string().max(40).optional(),
      })
      .parse(req.query ?? {})
    const q = `%${(query.q ?? '').trim()}%`
    const rows = await db.query(
      `select id, title, domain, url, snippet, category, indexed_at
         from external_index
        where status = 'indexed'
          and ($1 = '' or category = $1)
          and ($2 = '%%' or title ilike $2 or domain ilike $2 or snippet ilike $2)
        order by indexed_at desc`,
      [query.category && query.category !== 'Todos' ? query.category : '', q],
    )
    return {results: rows, indexSize: 1284, crawled: false}
  })

  app.get('/me/adult/portal-preferences', async req => {
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    const [row] = await db.query(
      `select * from adult_portal_preferences where did = $1`,
      [did],
    )
    return prefsFromRow(row)
  })

  app.put('/me/adult/portal-preferences', async req => {
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    const body = prefsBody.parse(req.body)
    await db.query(
      `insert into adult_portal_preferences
         (did, blur_thumbnails, autoplay_videos, hide_from_main, confirm_external, formats, categories, muted_words)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (did) do update set
         blur_thumbnails = excluded.blur_thumbnails,
         autoplay_videos = excluded.autoplay_videos,
         hide_from_main = excluded.hide_from_main,
         confirm_external = excluded.confirm_external,
         formats = excluded.formats,
         categories = excluded.categories,
         muted_words = excluded.muted_words,
         updated_at = now()`,
      [
        did,
        body.blurThumbnails,
        body.autoplayVideos,
        body.hideFromMain,
        body.confirmExternal,
        body.formats.join(','),
        body.categories.join(','),
        body.mutedWords,
      ],
    )
    return {ok: true}
  })

  app.post('/portal/publish', async req => {
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    const body = publishBody.parse(req.body)
    const id = newId('pi')
    const hash = body.contentHash
    if (scanBeforePublish(hash) === 'quarantine') {
      await db.query(
        `insert into portal_items
           (id, format, title, handle, tags, adult, status, content_hash, author_did)
         values ($1, $2, $3, 'voce', $4, true, 'quarantined', $5, $6)`,
        [id, body.format, body.title, body.tags.join(','), hash ?? null, did],
      )
      const caseId = await holdForMatch(db, 'portal_item', id, hash ?? '')
      return {status: 'quarantined', id, caseId}
    }
    await db.transaction(async tx => {
      await tx.query(
        `insert into portal_items
           (id, format, title, handle, tags, adult, status, content_hash, author_did)
         values ($1, $2, $3, 'voce', $4, true, 'published', $5, $6)`,
        [id, body.format, body.title, body.tags.join(','), hash ?? null, did],
      )
      await tx.query(
        `insert into portal_consent_attestations (id, did, resource_id, statement)
         values ($1, $2, $3, $4)`,
        [newId('cns'), did, id, CONSENT_STATEMENT],
      )
    })
    await audit(db, {
      actor: did,
      action: 'portal.publish',
      resourceType: 'portal_item',
      resourceId: id,
      reason: body.visibility,
      result: 'ok',
    })
    return {status: 'published', id}
  })

  app.post('/portal/reports', async req => {
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    const body = z
      .object({
        resourceKind: z.enum(['portal_item', 'external_page', 'account']),
        resourceId: z.string().min(1).max(80),
        reasonCode: z.enum([
          'non_consensual',
          'illegal_content',
          'spam',
          'other',
        ]),
      })
      .parse(req.body)
    const [dup] = await db.query(
      `select 1 from portal_reports
        where reporter_did = $1 and resource_kind = $2 and resource_id = $3`,
      [did, body.resourceKind, body.resourceId],
    )
    if (dup) throw conflict('already_reported')
    const priority =
      body.reasonCode === 'spam' || body.reasonCode === 'other' ? 4 : 1
    const caseId = await openCase(db, {
      source: 'report',
      resourceType: body.resourceKind,
      resourceId: body.resourceId,
      reasonCode: body.reasonCode,
      priority,
      status: priority === 1 ? 'ACTION_REQUIRED' : 'OPEN',
    })
    const id = newId('prp')
    await db.query(
      `insert into portal_reports
         (id, reporter_did, resource_kind, resource_id, reason_code, case_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, did, body.resourceKind, body.resourceId, body.reasonCode, caseId],
    )
    return {reportId: id, caseId}
  })

  /** Curated insert only. Refuses to run outside dev and never fetches a URL. */
  app.post('/dev/portal/index', async req => {
    ctx.devOnly()
    const did = await ctx.user(req)
    await assertAdultAccess(db, did)
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        domain: z.string().trim().min(1).max(253),
        url: z.string().trim().min(8).max(500),
        snippet: z.string().trim().min(1).max(500),
        category: z.enum(['Fotografia', 'Literatura', 'Portfólios', 'Saúde']),
        contentHash: z.string().max(200).optional(),
      })
      .parse(req.body)
    if (body.url.startsWith('http') === false) throw badRequest('invalid_url')
    const id = newId('ex')
    const outcome = scanBeforePublish(body.contentHash)
    await db.query(
      `insert into external_index
         (id, title, domain, url, snippet, category, status, content_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        body.title,
        body.domain,
        body.url,
        body.snippet,
        body.category,
        outcome === 'ok' ? 'indexed' : 'quarantined',
        body.contentHash ?? null,
      ],
    )
    if (outcome === 'quarantine') {
      await holdForMatch(db, 'external_page', id, body.contentHash ?? '')
    }
    return {id, status: outcome === 'ok' ? 'indexed' : 'quarantined'}
  })
})
