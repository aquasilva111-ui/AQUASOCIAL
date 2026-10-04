import {z} from 'zod'

import {
  assertAdultAccess,
  blockedDids,
  notRestrictedSql,
} from '../entitlements/index.js'
import {registerRoutes} from '../registry.js'
import {VIDEO_IS_LIVE} from '../views/index.js'

const LIMIT = 40

/**
 * Drops +18: the feed of short clips. A drop is a published video that has a
 * preview clip (`preview_asset_id`) — there is no second copy of anything and
 * nothing is read from the social Drops graph. The clip plays through
 * POST /views/videos/:id/preview; the full video is gated by Entitlements.
 */
registerRoutes(ctx => {
  const {app, db, media} = ctx

  app.get('/drops', async req => {
    const me = await ctx.user(req)
    await assertAdultAccess(db, me)
    const {tab} = z
      .object({tab: z.enum(['foryou', 'following']).default('foryou')})
      .parse(req.query)
    const rows = await db.query(
      `select v.id, v.title, v.access_policy, v.published_at, v.poster_asset_id,
              c.id as creator_id, c.did as creator_did, c.handle as creator_handle, p.duration_ms
         from videos v
         join creators c on c.id = v.creator_id
         join media_assets a on a.id = v.media_asset_id
         join media_assets p on p.id = v.preview_asset_id
        where ${VIDEO_IS_LIVE} and v.preview_asset_id is not null
          and a.status = 'READY' and p.status = 'READY' and c.status = 'approved'
          and ${notRestrictedSql('video', 'v.id')}
          and not exists (select 1 from adult_mutes m where m.muter_did = $1 and m.creator_did = c.did)
          and ($2::boolean is false or exists (
                select 1 from adult_follows f where f.follower_did = $1 and f.creator_did = c.did))
        order by v.published_at desc limit ${LIMIT * 2}`,
      [me, tab === 'following'],
    )
    const blocked = await blockedDids(db, me)
    const visible = rows
      .filter(r => !blocked.has(r.creator_did))
      .slice(0, LIMIT)
    return {
      drops: await Promise.all(
        visible.map(async r => ({
          id: r.id,
          title: r.title,
          creator: {
            id: r.creator_id,
            did: r.creator_did,
            handle: r.creator_handle,
          },
          accessPolicy: r.access_policy,
          previewDurationMs: r.duration_ms,
          publishedAt: r.published_at,
          posterUrl: r.poster_asset_id
            ? await media.authorize(r.poster_asset_id, 'thumbnail').then(
                x => x.url,
                () => null,
              )
            : null,
        })),
      ),
    }
  })
})
