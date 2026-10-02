import {z} from 'zod'

import {getApprovedCreatorForDid} from '../economy/index.js'
import {assertAdultAccess, blockedDids} from '../entitlements/index.js'
import {badRequest, conflict, notFound} from '../lib/errors.js'
import {newId} from '../lib/ids.js'
import {enforce, SharedRateLimiter} from '../lib/rateLimit.js'
import {registerRoutes} from '../registry.js'

const MAX_CHARACTERS = 40
const MAX_PARTS = 500

/** The product rule, checked here for a clear error; the database enforces it too. */
const character = z.object({
  name: z.string().trim().min(1).max(80),
  age: z.number().int(),
})

function assertAdultCharacters(list: {age: number}[]) {
  if (list.some(c => c.age < 18)) throw badRequest('characters_must_be_adults')
}

/**
 * Reads +18: serial stories. Every book declares its characters and every
 * character must be 18 or older — enforced by the API and by a database
 * check, so no code path can store a younger character. Books are read from
 * their own +18 tables, never from the social Reads graph.
 */
registerRoutes(ctx => {
  const {app, db} = ctx
  const limiter = new SharedRateLimiter(db, 300, 3600_000)

  const requireAdult = async (req: Parameters<typeof ctx.user>[0]) => {
    const me = await ctx.user(req)
    await assertAdultAccess(db, me)
    return me
  }

  async function ownedBook(me: string, id: string) {
    const creator = await getApprovedCreatorForDid(db, me)
    const [book] = await db.query(
      `select * from adult_books where id = $1 and creator_id = $2`,
      [id, creator.id],
    )
    if (!book || book.status === 'removed') throw notFound()
    return book
  }

  // ------------------------------------------------------------ author
  app.post('/creator/books', async req => {
    const me = await requireAdult(req)
    await enforce(limiter, `reads:${me}`)
    const creator = await getApprovedCreatorForDid(db, me)
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).optional(),
        characters: z.array(character).min(1).max(MAX_CHARACTERS),
      })
      .parse(req.body)
    assertAdultCharacters(body.characters)
    if (
      new Set(body.characters.map(c => c.name)).size !== body.characters.length
    )
      throw badRequest('duplicate_character')
    const id = newId('bok')
    await db.transaction(async tx => {
      await tx.query(
        `insert into adult_books (id, creator_id, title, description) values ($1, $2, $3, $4)`,
        [id, creator.id, body.title, body.description ?? null],
      )
      for (const c of body.characters)
        await tx.query(
          `insert into adult_book_characters (id, book_id, name, age) values ($1, $2, $3, $4)`,
          [newId('chr'), id, c.name, c.age],
        )
    })
    return {bookId: id}
  })

  app.post('/creator/books/:id/characters', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = character.parse(req.body)
    assertAdultCharacters([body])
    await ownedBook(me, id)
    const [n] = await db.query(
      `select count(*)::int as n from adult_book_characters where book_id = $1`,
      [id],
    )
    if (n.n >= MAX_CHARACTERS) throw conflict('limit_reached')
    const inserted = await db.query(
      `insert into adult_book_characters (id, book_id, name, age) values ($1, $2, $3, $4)
       on conflict do nothing returning 1`,
      [newId('chr'), id, body.name, body.age],
    )
    if (!inserted.length) throw conflict('duplicate_character')
    return {ok: true}
  })

  app.post('/creator/books/:id/parts', async req => {
    const me = await requireAdult(req)
    await enforce(limiter, `reads:${me}`)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const body = z
      .object({
        title: z.string().max(200).optional(),
        body: z.string().min(1).max(60000),
      })
      .parse(req.body)
    await ownedBook(me, id)
    const [next] = await db.query(
      `select coalesce(max(number), 0)::int + 1 as n from adult_book_parts where book_id = $1`,
      [id],
    )
    if (next.n > MAX_PARTS) throw conflict('limit_reached')
    await db.query(
      `insert into adult_book_parts (book_id, number, title, body) values ($1, $2, $3, $4)`,
      [id, next.n, body.title ?? null, body.body],
    )
    await db.query(`update adult_books set updated_at = now() where id = $1`, [
      id,
    ])
    return {number: next.n}
  })

  app.post('/creator/books/:id/publish', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    await ownedBook(me, id)
    const [c] = await db.query(
      `select (select count(*)::int from adult_book_characters where book_id = $1) as characters,
              (select count(*)::int from adult_book_parts where book_id = $1) as parts`,
      [id],
    )
    if (!c.characters) throw badRequest('characters_required')
    if (!c.parts) throw badRequest('part_required')
    await db.query(
      `update adult_books set status = 'published', published_at = coalesce(published_at, now()), updated_at = now()
        where id = $1`,
      [id],
    )
    return {ok: true}
  })

  // ------------------------------------------------------------ readers
  app.get('/reads/books', async req => {
    const me = await requireAdult(req)
    const rows = await db.query(
      `select b.id, b.title, b.description, b.published_at, c.did as creator_did, c.handle as creator_handle,
              (select count(*)::int from adult_book_parts p where p.book_id = b.id) as parts
         from adult_books b join creators c on c.id = b.creator_id
        where b.status = 'published' and c.status = 'approved'
          and not exists (select 1 from adult_mutes m where m.muter_did = $1 and m.creator_did = c.did)
        order by b.published_at desc limit 60`,
      [me],
    )
    const blocked = await blockedDids(db, me)
    return {
      books: rows
        .filter(r => !blocked.has(r.creator_did))
        .map(r => ({
          id: r.id,
          title: r.title,
          description: r.description,
          parts: r.parts,
          publishedAt: r.published_at,
          author: {did: r.creator_did, handle: r.creator_handle},
        })),
    }
  })

  async function readableBook(me: string, id: string) {
    const [b] = await db.query(
      `select b.*, c.did as creator_did, c.handle as creator_handle from adult_books b
         join creators c on c.id = b.creator_id
        where b.id = $1 and b.status = 'published' and c.status = 'approved'`,
      [id],
    )
    if (!b || (await blockedDids(db, me)).has(b.creator_did)) throw notFound()
    return b
  }

  app.get('/reads/books/:id', async req => {
    const me = await requireAdult(req)
    const {id} = z.object({id: z.string()}).parse(req.params)
    const b = await readableBook(me, id)
    const [characters, parts] = await Promise.all([
      db.query(
        `select name, age from adult_book_characters where book_id = $1 order by name`,
        [id],
      ),
      db.query(
        `select number, title from adult_book_parts where book_id = $1 order by number`,
        [id],
      ),
    ])
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      author: {did: b.creator_did, handle: b.creator_handle},
      characters,
      parts: parts.map(p => ({number: p.number, title: p.title})),
    }
  })

  app.get('/reads/books/:id/parts/:number', async req => {
    const me = await requireAdult(req)
    const {id, number} = z
      .object({id: z.string(), number: z.coerce.number().int().positive()})
      .parse(req.params)
    await readableBook(me, id)
    const [p] = await db.query(
      `select number, title, body from adult_book_parts where book_id = $1 and number = $2`,
      [id, number],
    )
    if (!p) throw notFound()
    return {number: p.number, title: p.title, body: p.body}
  })
})
