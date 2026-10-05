import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {
  assertAdultAccess,
  blockedDids,
  registerResourceResolver,
} from '../entitlements/index.js'
import {badRequest, conflict, forbidden, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {enforce, SharedRateLimiter} from '../lib/rateLimit.js'
import {registerRoutes} from '../registry.js'
import {recordSignal} from '../social/index.js'
import {VIDEO_IS_LIVE} from '../views/index.js'

const did = z.string().regex(/^did:(plc|web):[a-zA-Z0-9._:%-]{1,200}$/)
const TARGET_TYPES = ['post', 'video', 'book', 'pin'] as const
type TargetType = (typeof TARGET_TYPES)[number]
const PAGE = 20
const COMMENT_PAGE = 50
const MAX_MEDIA = 4

// Trust & Safety sees social posts and comments as their own resource types.
for (const [type, table] of [
  ['social_post', 'adult_posts'],
  ['social_comment', 'adult_comments'],
] as const)
  registerResourceResolver(type, async (db, id) => {
    const [r] = await db.query(
      `select author_did, status from ${table} where id = $1`,
      [id],
    )
    if (!r) return undefined
    return {
      type,
      id,
      policy: 'free',
      status: r.status,
      ownerDids: [r.author_did],
      scopes: [],
    }
  })

/** Who owns a target, or null when it is gone or not visible to everyone. */
async function targetOwner(db: Queryable, type: TargetType, id: string) {
  const sql = {
    post: `select author_did as d from adult_posts where id = $1 and status = 'published'`,
    video: `select c.did as d from videos v join creators c on c.id = v.creator_id where v.id = $1 and ${VIDEO_IS_LIVE}`,
    book: `select c.did as d from adult_books b join creators c on c.id = b.creator_id where b.id = $1 and b.status = 'published'`,
    pin: `select b.owner_did as d from adult_board_items i join adult_boards b on b.id = i.board_id where i.id = $1 and b.visibility = 'public'`,
  }[type]
  const [row] = await db.query<{d: string}>(sql, [id])
  return row?.d ?? null
}

type Author = {did: string; handle: string | null; displayName: string | null}

async function authorsOf(db: Queryable, dids: string[]) {
  const unique = [...new Set(dids)]
  const map = new Map<string, Author>()
  for (const d of unique) map.set(d, {did: d, handle: null, displayName: null})
  if (!unique.length) return map
  const profiles = await db.query(
    `select user_did, display_name from adult_profiles where user_did = any($1)`,
    [unique],
  )
  for (const p of profiles) map.get(p.user_did)!.displayName = p.display_name
  const creators = await db.query(
    `select did, handle from creators where did = any($1)`,
    [unique],
  )
  for (const c of creators) map.get(c.did)!.handle = c.handle
  return map
}

export type Engagement = {
  likes: number
  reposts: number
  comments: number
  liked: boolean
  reposted: boolean
}

/** Counts and the viewer's own state for a mixed list of targets. */
async function engagementFor(
  db: Queryable,
  me: string,
  targets: {type: TargetType; id: string}[],
) {
  const out = new Map<string, Engagement>()
  const key = (t: string, i: string) => `${t}:${i}`
  for (const t of targets)
    out.set(key(t.type, t.id), {
      likes: 0,
      reposts: 0,
      comments: 0,
      liked: false,
      reposted: false,
    })
  if (!targets.length) return out
  const types = targets.map(t => t.type)
  const ids = targets.map(t => t.id)
  const pairs = `(target_type, target_id) in (select * from unnest($1::text[], $2::text[]))`
  const [likes, reposts, comments] = await Promise.all([
    db.query(
      `select target_type, target_id, count(*)::int as n, bool_or(user_did = $3) as mine
         from adult_likes where ${pairs} group by 1, 2`,
      [types, ids, me],
    ),
    db.query(
      `select target_type, target_id, count(*)::int as n, bool_or(user_did = $3) as mine
         from adult_reposts where ${pairs} group by 1, 2`,
      [types, ids, me],
    ),
    db.query(
      `select target_type, target_id, count(*)::int as n from adult_comments
        where status = 'published' and ${pairs} group by 1, 2`,
      [types, ids],
    ),
  ])
  for (const r of likes) {
    const e = out.get(key(r.target_type, r.target_id))!
    e.likes = r.n
    e.liked = r.mine
  }
  for (const r of reposts) {
    const e = out.get(key(r.target_type, r.target_id))!
    e.reposts = r.n
    e.reposted = r.mine
  }
  for (const r of comments)
    out.get(key(r.target_type, r.target_id))!.comments = r.n
  return out
}

registerRoutes(ctx => {
  const {app, db, media} = ctx
  const limiter = new SharedRateLimiter(db, 600, 3600_000)

  const requireAdult = async (req: Parameters<typeof ctx.user>[0]) => {
    const me = await ctx.user(req)
    await assertAdultAccess(db, me)
    return me
  }

  /** The target exists, is visible, and has no block with the viewer. */
  async function engageable(me: string, type: TargetType, id: string) {
    const owner = await targetOwner(db, type, id)
    if (!owner || (await blockedDids(db, me)).has(owner)) throw notFound()
    return owner
  }

  async function mediaFor(postIds: string[]) {
    const out = new Map<string, any[]>()
    if (!postIds.length) return out
    const rows = await db.query(
      `select m.post_id, m.media_asset_id, a.width, a.height
         from adult_post_media m join media_assets a on a.id = m.media_asset_id
        where m.post_id = any($1) and a.status = 'READY' order by m.position`,
      [postIds],
    )
    for (const r of rows) {
      const url = await media.authorize(r.media_asset_id, 'thumbnail').then(
        x => x.url,
        () => null,
      )
      if (!url) continue
      const list = out.get(r.post_id) ?? []
      list.push({
        id: r.media_asset_id,
        url,
        width: r.width,
        height: r.height,
        sensitive: true,
      })
      out.set(r.post_id, list)
    }
    return out
  }

  /** Posts → API shape, with authors, media and engagement. */
  async function presentPosts(
    me: string,
    rows: {
      post_id: string
      author_did: string
      body: string
      created_at: Date
      reposted_by?: string | null
    }[],
  ) {
    const authors = await authorsOf(
      db,
      rows.flatMap(r => [
        r.author_did,
        ...(r.reposted_by ? [r.reposted_by] : []),
      ]),
    )
    const ids = [...new Set(rows.map(r => r.post_id))]
    const [eng, medias] = await Promise.all([
      engagementFor(
        db,
        me,
        ids.map(id => ({type: 'post' as const, id})),
      ),
      mediaFor(ids),
    ])
    return rows.map(r => ({
      id: r.post_id,
      author: authors.get(r.author_did),
      body: r.body,
      media: medias.get(r.post_id) ?? [],
      createdAt: r.created_at,
      repostedBy: r.reposted_by ? authors.get(r.reposted_by) : null,
      engagement: eng.get(`post:${r.post_id}`),
    }))
  }

  const ISO = `to_char(%s at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

  async function relationFlags(me: string, other: string) {
    const [blocked, blockedMe] = await Promise.all([
      db.query(
        `select 1 from adult_blocks where blocker_did = $1 and blocked_did = $2`,
        [me, other],
      ),
      db.query(
        `select 1 from adult_blocks where blocker_did = $2 and blocked_did = $1`,
        [me, other],
      ),
    ])
    return {blocked: blocked.length > 0, blockedMe: blockedMe.length > 0}
  }

  // ------------------------------------------------------------ posts
  app.post('/adult/posts', async req => {
    const me = await requireAdult(req)
    await enforce(limiter, `net:${me}`)
    const body = z
      .object({
        body: z.string().max(3000).default(''),
        mediaAssetIds: z.array(z.string()).max(MAX_MEDIA).default([]),
      })
      .parse(req.body)
    const text = body.body.trim()
    const assetIds = [...new Set(body.mediaAssetIds)]
    if (!text && !assetIds.length) throw badRequest('empty_post')
    for (const assetId of assetIds) {
      const [a] = await db.query(
        `select owner_did, kind, status from media_assets where id = $1`,
        [assetId],
      )
      if (!a || a.owner_did !== me || a.kind !== 'image') throw notFound()
      if (a.status !== 'READY') throw conflict('media_not_ready')
    }
    const id = newId('pst')
    await db.transaction(async tx => {
      await tx.query(
        `insert into adult_posts (id, author_did, body) values ($1, $2, $3)`,
        [id, me, text],
      )
      for (const [position, assetId] of assetIds.entries())
        await tx.query(
          `insert into adult_post_media (post_id, media_asset_id, position) values ($1, $2, $3)`,
          [id, assetId, position],
        )
    })
    return {postId: id}
  })

  app.delete('/adult/posts/:id', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await db.query(
      `update adult_posts set status = 'removed' where id = $1 and author_did = $2 and status = 'published'`,
      [id, me],
    )
    return {ok: true}
  })

  app.get('/adult/posts/:id', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await engageable(me, 'post', id)
    const rows = await db.query(
      `select id as post_id, author_did, body, created_at from adult_posts where id = $1`,
      [id],
    )
    return {post: (await presentPosts(me, rows as any))[0]}
  })

  // ------------------------------------------------------------ feed
  app.get('/adult/feed', async req => {
    const me = await requireAdult(req)
    const q = z
      .object({
        tab: z.enum(['following', 'discover']).default('following'),
        before: z.string().datetime().optional(),
      })
      .parse(req.query)
    const notMuted = `not exists (select 1 from adult_mutes m where m.muter_did = $1 and m.creator_did = p.author_did)`
    const rows =
      q.tab === 'following'
        ? await db.query(
            `with followed as (
               select creator_did as d from adult_follows where follower_did = $1
               union select $1::text
             ), events as (
               select p.id as post_id, p.created_at as at, null::text as reposted_by
                 from adult_posts p where p.status = 'published' and p.author_did in (select d from followed)
               union all
               select r.target_id, r.created_at, r.user_did
                 from adult_reposts r join adult_posts p on p.id = r.target_id
                where r.target_type = 'post' and p.status = 'published' and r.user_did in (select d from followed)
             )
             select e.post_id, e.at, e.reposted_by, ${ISO.replace('%s', 'e.at')} as at_iso,
                    p.author_did, p.body, p.created_at
               from events e join adult_posts p on p.id = e.post_id
              where ($2::timestamptz is null or e.at < $2::timestamptz) and ${notMuted}
              order by e.at desc, e.post_id desc limit ${PAGE + 1}`,
            [me, q.before ?? null],
          )
        : await db.query(
            `select p.id as post_id, p.created_at as at, null::text as reposted_by,
                    ${ISO.replace('%s', 'p.created_at')} as at_iso, p.author_did, p.body, p.created_at
               from adult_posts p
              where p.status = 'published' and ($2::timestamptz is null or p.created_at < $2::timestamptz)
                and ${notMuted}
              order by p.created_at desc, p.id desc limit ${PAGE + 1}`,
            [me, q.before ?? null],
          )
    const page = rows.slice(0, PAGE)
    const blocked = await blockedDids(db, me)
    const visible = page.filter(
      r =>
        !blocked.has(r.author_did) &&
        !(r.reposted_by && blocked.has(r.reposted_by)),
    )
    return {
      posts: await presentPosts(me, visible as any),
      // The cursor follows the raw page so filtered items never stall paging.
      next: rows.length > PAGE ? page[page.length - 1].at_iso : null,
    }
  })

  // ------------------------------------------------------------ profiles
  app.get('/adult/users/:did', async req => {
    const me = await requireAdult(req)
    const {did: target} = z.object({did}).parse(req.params)
    const flags = await relationFlags(me, target)
    if (flags.blockedMe) throw notFound()
    const [counts] = await db.query(
      `select (select count(*)::int from adult_posts where author_did = $1 and status = 'published') as posts,
              (select count(*)::int from adult_follows where creator_did = $1) as followers,
              (select count(*)::int from adult_follows where follower_did = $1) as following,
              exists (select 1 from adult_follows where follower_did = $2 and creator_did = $1) as is_following,
              exists (select 1 from adult_mutes where muter_did = $2 and creator_did = $1) as is_muted`,
      [target, me],
    )
    const [profile] = await db.query(
      `select bio from adult_profiles where user_did = $1`,
      [target],
    )
    const author = (await authorsOf(db, [target])).get(target)!
    return {
      ...author,
      bio: profile?.bio ?? null,
      counts: {
        posts: counts.posts,
        followers: counts.followers,
        following: counts.following,
      },
      viewer: {
        following: counts.is_following,
        muted: counts.is_muted,
        blocked: flags.blocked,
        self: me === target,
      },
    }
  })

  app.get('/adult/users/:did/posts', async req => {
    const me = await requireAdult(req)
    const {did: target} = z.object({did}).parse(req.params)
    const {before} = z
      .object({before: z.string().datetime().optional()})
      .parse(req.query)
    const flags = await relationFlags(me, target)
    if (flags.blockedMe || flags.blocked) throw notFound()
    const rows = await db.query(
      `select id as post_id, author_did, body, created_at, ${ISO.replace('%s', 'created_at')} as at_iso
         from adult_posts
        where author_did = $1 and status = 'published' and ($2::timestamptz is null or created_at < $2::timestamptz)
        order by created_at desc, id desc limit ${PAGE + 1}`,
      [target, before ?? null],
    )
    const page = rows.slice(0, PAGE)
    return {
      posts: await presentPosts(me, page as any),
      next: rows.length > PAGE ? page[page.length - 1].at_iso : null,
    }
  })

  app.put('/me/adult/profile', async req => {
    const me = await requireAdult(req)
    const body = z
      .object({
        displayName: z.string().trim().max(60).optional(),
        bio: z.string().trim().max(500).optional(),
      })
      .parse(req.body)
    await db.query(
      `insert into adult_profiles (user_did, display_name, bio) values ($1, $2, $3)
       on conflict (user_did) do update set
         display_name = coalesce($2, adult_profiles.display_name),
         bio = coalesce($3, adult_profiles.bio), updated_at = now()`,
      [me, body.displayName ?? null, body.bio ?? null],
    )
    return {ok: true}
  })

  // ------------------------------------------------------------ engagement
  const target = z.object({type: z.enum(TARGET_TYPES), id: z.string()})

  for (const e of [
    {path: 'like', table: 'adult_likes', signal: 'like'},
    {path: 'repost', table: 'adult_reposts', signal: null},
  ] as const) {
    app.put(`/adult/engage/:type/:id/${e.path}`, async req => {
      const me = await requireAdult(req)
      await enforce(limiter, `net:${me}`)
      const t = target.parse(req.params)
      await engageable(me, t.type, t.id)
      const inserted = await db.query(
        `insert into ${e.table} (user_did, target_type, target_id) values ($1, $2, $3) on conflict do nothing returning 1`,
        [me, t.type, t.id],
      )
      if (inserted.length && e.signal)
        await recordSignal(db, me, e.signal, {type: t.type, id: t.id})
      return {ok: true}
    })
    app.delete(`/adult/engage/:type/:id/${e.path}`, async req => {
      const me = await requireAdult(req)
      const t = target.parse(req.params)
      await db.query(
        `delete from ${e.table} where user_did = $1 and target_type = $2 and target_id = $3`,
        [me, t.type, t.id],
      )
      return {ok: true}
    })
  }

  app.get('/adult/engage/:type/:id', async req => {
    const me = await requireAdult(req)
    const t = target.parse(req.params)
    await engageable(me, t.type, t.id)
    return (await engagementFor(db, me, [t])).get(`${t.type}:${t.id}`)
  })

  app.get('/adult/engage/:type/:id/comments', async req => {
    const me = await requireAdult(req)
    const t = target.parse(req.params)
    await engageable(me, t.type, t.id)
    const rows = await db.query(
      `select c.id, c.author_did, c.body, c.created_at from adult_comments c
        where c.target_type = $1 and c.target_id = $2 and c.status = 'published'
          and not exists (select 1 from adult_mutes m where m.muter_did = $3 and m.creator_did = c.author_did)
        order by c.created_at desc, c.id desc limit ${COMMENT_PAGE}`,
      [t.type, t.id, me],
    )
    const blocked = await blockedDids(db, me)
    const kept = rows.filter(r => !blocked.has(r.author_did))
    const authors = await authorsOf(
      db,
      kept.map(r => r.author_did),
    )
    return {
      comments: kept.map(r => ({
        id: r.id,
        author: authors.get(r.author_did),
        body: r.body,
        createdAt: r.created_at,
      })),
    }
  })

  app.post('/adult/engage/:type/:id/comments', async req => {
    const me = await requireAdult(req)
    await enforce(limiter, `net:${me}`)
    const t = target.parse(req.params)
    const body = z
      .object({body: z.string().trim().min(1).max(1000)})
      .parse(req.body)
    await engageable(me, t.type, t.id)
    const id = newId('cmt')
    await db.query(
      `insert into adult_comments (id, author_did, target_type, target_id, body) values ($1, $2, $3, $4, $5)`,
      [id, me, t.type, t.id, body.body],
    )
    return {commentId: id}
  })

  /** The author, or the owner of what was commented on, can remove a comment. */
  app.delete('/adult/comments/:id', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const [c] = await db.query(
      `select author_did, target_type, target_id from adult_comments where id = $1 and status = 'published'`,
      [id],
    )
    if (!c) throw notFound()
    const owner = await targetOwner(db, c.target_type, c.target_id)
    if (c.author_did !== me && owner !== me) throw forbidden()
    await db.query(
      `update adult_comments set status = 'removed' where id = $1`,
      [id],
    )
    return {ok: true}
  })
})
