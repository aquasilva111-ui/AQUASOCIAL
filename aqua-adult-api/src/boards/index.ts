import {z} from 'zod'

import {type Queryable} from '../db/index.js'
import {assertAdultAccess, blockedDids} from '../entitlements/index.js'
import {conflict, forbidden, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {enforce, SharedRateLimiter} from '../lib/rateLimit.js'
import {registerRoutes} from '../registry.js'

const MAX_BOARDS = 100
const MAX_ITEMS = 2000
const TONES = ['warm', 'cool', 'neutral'] as const

/** An image the user owns and that finished processing. */
async function ownedReadyImage(db: Queryable, did: string, assetId: string) {
  const [a] = await db.query(
    `select kind, status, owner_did from media_assets where id = $1`,
    [assetId],
  )
  if (!a || a.owner_did !== did || a.kind !== 'image') throw notFound()
  if (a.status !== 'READY') throw conflict('media_not_ready')
}

/**
 * Visionboard +18: private image boards. Private by default, never exposed
 * to the social app, and images are only served to age-verified users. A
 * board holds references to media the user already owns — nothing is copied.
 */
registerRoutes(ctx => {
  const {app, db, media} = ctx
  const limiter = new SharedRateLimiter(db, 600, 3600_000)

  const requireAdult = async (req: Parameters<typeof ctx.user>[0]) => {
    const me = await ctx.user(req)
    await assertAdultAccess(db, me)
    return me
  }

  /** Owner, or anyone adult when the board is public (and no block between them). */
  async function readableBoard(me: string, id: string) {
    const [b] = await db.query(`select * from adult_boards where id = $1`, [id])
    if (!b) throw notFound()
    if (b.owner_did !== me) {
      if (b.visibility !== 'public') throw notFound()
      if ((await blockedDids(db, me)).has(b.owner_did)) throw notFound()
    }
    return b
  }

  const present = (b: Record<string, any>, count?: number) => ({
    id: b.id,
    name: b.name,
    visibility: b.visibility,
    createdAt: b.created_at,
    ...(count === undefined ? {} : {itemCount: count}),
  })

  app.post('/me/adult/boards', async req => {
    const me = await requireAdult(req)
    await enforce(limiter, `boards:${me}`)
    const body = z
      .object({name: z.string().trim().min(1).max(80)})
      .parse(req.body)
    const [n] = await db.query(
      `select count(*)::int as n from adult_boards where owner_did = $1`,
      [me],
    )
    if (n.n >= MAX_BOARDS) throw conflict('limit_reached')
    const id = newId('brd')
    await db.query(
      `insert into adult_boards (id, owner_did, name) values ($1, $2, $3)`,
      [id, me, body.name],
    )
    return {boardId: id}
  })

  app.get('/me/adult/boards', async req => {
    const me = await requireAdult(req)
    const rows = await db.query(
      `select b.*, (select count(*)::int from adult_board_items i where i.board_id = b.id) as items
         from adult_boards b where b.owner_did = $1 order by b.created_at desc`,
      [me],
    )
    return {boards: rows.map(b => present(b, b.items))}
  })

  app.patch('/me/adult/boards/:id', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        visibility: z.enum(['private', 'public']).optional(),
      })
      .parse(req.body)
    const [b] = await db.query(
      `select owner_did from adult_boards where id = $1`,
      [id],
    )
    if (!b || b.owner_did !== me) throw notFound()
    await db.query(
      `update adult_boards set name = coalesce($2, name), visibility = coalesce($3, visibility) where id = $1`,
      [id, body.name ?? null, body.visibility ?? null],
    )
    return {ok: true}
  })

  app.delete('/me/adult/boards/:id', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await db.query(
      `delete from adult_boards where id = $1 and owner_did = $2`,
      [id, me],
    )
    return {ok: true}
  })

  app.post('/me/adult/boards/:id/items', async req => {
    const me = await requireAdult(req)
    await enforce(limiter, `boards:${me}`)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        mediaAssetId: z.string(),
        tone: z.enum(TONES).default('neutral'),
        note: z.string().max(500).optional(),
      })
      .parse(req.body)
    const [b] = await db.query(
      `select owner_did from adult_boards where id = $1`,
      [id],
    )
    if (!b || b.owner_did !== me) throw notFound()
    await ownedReadyImage(db, me, body.mediaAssetId)
    const [n] = await db.query(
      `select count(*)::int as n from adult_board_items where board_id = $1`,
      [id],
    )
    if (n.n >= MAX_ITEMS) throw conflict('limit_reached')
    const itemId = newId('bit')
    const inserted = await db.query(
      `insert into adult_board_items (id, board_id, media_asset_id, tone, note)
       values ($1, $2, $3, $4, $5) on conflict do nothing returning 1`,
      [itemId, id, body.mediaAssetId, body.tone, body.note ?? null],
    )
    if (!inserted.length) throw conflict('already_in_board')
    return {itemId}
  })

  app.delete('/me/adult/boards/:id/items/:itemId', async req => {
    const me = await requireAdult(req)
    const {id, itemId} = z
      .object({id: z.string(), itemId: z.string()})
      .parse(req.params)
    const [b] = await db.query(
      `select owner_did from adult_boards where id = $1`,
      [id],
    )
    if (!b || b.owner_did !== me) throw forbidden()
    await db.query(
      `delete from adult_board_items where id = $1 and board_id = $2`,
      [itemId, id],
    )
    return {ok: true}
  })

  app.get('/adult/boards/:id', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const {tone} = z.object({tone: z.enum(TONES).optional()}).parse(req.query)
    const board = await readableBoard(me, id)
    const rows = await db.query(
      `select i.id, i.media_asset_id, i.tone, i.note, i.created_at, a.width, a.height
         from adult_board_items i join media_assets a on a.id = i.media_asset_id
        where i.board_id = $1 and a.status = 'READY' and ($2::text is null or i.tone = $2)
        order by i.created_at desc limit 200`,
      [id, tone ?? null],
    )
    return {
      board: present(board),
      mine: board.owner_did === me,
      items: await Promise.all(
        rows.map(async r => ({
          id: r.id,
          tone: r.tone,
          note: r.note,
          width: r.width,
          height: r.height,
          // The client always renders these blurred until the user taps.
          sensitive: true,
          imageUrl: await media.authorize(r.media_asset_id, 'thumbnail').then(
            x => x.url,
            () => null,
          ),
        })),
      ),
    }
  })

  app.get('/adult/boards', async req => {
    const me = await requireAdult(req)
    const blocked = await blockedDids(db, me)
    const rows = await db.query(
      `select * from adult_boards where visibility = 'public' and owner_did <> $1
        order by created_at desc limit 60`,
      [me],
    )
    return {
      boards: rows.filter(b => !blocked.has(b.owner_did)).map(b => present(b)),
    }
  })
})
