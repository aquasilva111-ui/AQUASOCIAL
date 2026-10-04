import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {RateLimiter, SharedRateLimiter} from '../src/lib/rateLimit.js'
import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const ME = did('fme')
const AUTHOR = did('fauthor')
const OTHER = did('fother')
const NEWBIE = did('fnewbie')

let t: TestApp
let f: ReturnType<typeof fixtures>

beforeAll(() => {
  f = fixtures()
})

beforeEach(async () => {
  t = await createTestApp()
  await t.verifiedUser(ME)
  await t.verifiedUser(OTHER)
  await t.approvedCreator(AUTHOR, 'fauthor')
})

describe('durable follows and mutes', () => {
  it('stores, lists and removes a follow', async () => {
    expect(
      (await t.call('PUT', `/me/adult/follows/${AUTHOR}`, ME)).status,
    ).toBe(200)
    const list = await t.call('GET', '/me/adult/follows', ME)
    expect(list.body.follows.map((x: any) => x.did)).toEqual([AUTHOR])
    await t.call('DELETE', `/me/adult/follows/${AUTHOR}`, ME)
    expect((await t.call('GET', '/me/adult/follows', ME)).body.follows).toEqual(
      [],
    )
  })

  it('keeps the list private to its owner', async () => {
    await t.call('PUT', `/me/adult/follows/${AUTHOR}`, ME)
    expect(
      (await t.call('GET', '/me/adult/follows', OTHER)).body.follows,
    ).toEqual([])
  })

  it('rejects self-follow, unverified users and blocked creators', async () => {
    expect((await t.call('PUT', `/me/adult/follows/${ME}`, ME)).status).toBe(
      400,
    )
    expect(
      (await t.call('PUT', `/me/adult/follows/${AUTHOR}`, NEWBIE)).status,
    ).toBe(403)
    await t.call('PUT', `/me/adult/blocks/${AUTHOR}`, ME)
    expect(
      (await t.call('PUT', `/me/adult/follows/${AUTHOR}`, ME)).status,
    ).toBe(409)
  })

  it('stores mutes separately from follows', async () => {
    await t.call('PUT', `/me/adult/mutes/${AUTHOR}`, ME)
    expect(
      (await t.call('GET', '/me/adult/mutes', ME)).body.mutes,
    ).toHaveLength(1)
    expect(
      (await t.call('GET', '/me/adult/follows', ME)).body.follows,
    ).toHaveLength(0)
  })
})

describe('signals and privacy switches', () => {
  it('records follow signals and lets the user read and wipe them', async () => {
    await t.call('PUT', `/me/adult/follows/${AUTHOR}`, ME)
    await t.call('POST', '/me/adult/signals', ME, {
      kind: 'like',
      resourceType: 'video',
      resourceId: 'v1',
    })
    const kinds = (
      await t.call('GET', '/me/adult/signals', ME)
    ).body.signals.map((s: any) => s.kind)
    expect(kinds.sort()).toEqual(['follow', 'like'])
    await t.call('DELETE', '/me/adult/signals', ME)
    expect((await t.call('GET', '/me/adult/signals', ME)).body.signals).toEqual(
      [],
    )
  })

  it('turning signals off records nothing and forgets the past', async () => {
    await t.call('POST', '/me/adult/signals', ME, {kind: 'view'})
    await t.call('PUT', '/me/adult/privacy', ME, {signalsEnabled: false})
    const r = await t.call('POST', '/me/adult/signals', ME, {kind: 'view'})
    expect(r.body.recorded).toBe(false)
    expect((await t.call('GET', '/me/adult/signals', ME)).body.signals).toEqual(
      [],
    )
  })

  it('search history can be switched off on its own', async () => {
    await t.call('POST', '/me/adult/signals', ME, {kind: 'search'})
    await t.call('POST', '/me/adult/signals', ME, {kind: 'view'})
    await t.call('PUT', '/me/adult/privacy', ME, {searchHistoryEnabled: false})
    const kinds = (
      await t.call('GET', '/me/adult/signals', ME)
    ).body.signals.map((s: any) => s.kind)
    expect(kinds).toEqual(['view'])
  })

  it('does not let a client forge server-side signal kinds', async () => {
    expect(
      (await t.call('POST', '/me/adult/signals', ME, {kind: 'follow'})).status,
    ).toBe(400)
  })
})

describe('shared rate limiter', () => {
  it('counts in the database, so two instances share one limit', async () => {
    const a = new SharedRateLimiter(t.db, 2, 60_000)
    const b = new SharedRateLimiter(t.db, 2, 60_000)
    const now = Date.now()
    expect(await a.take('k', now)).toBe(true)
    expect(await b.take('k', now)).toBe(true)
    expect(await a.take('k', now)).toBe(false)
    // another key and the next window are independent
    expect(await a.take('other', now)).toBe(true)
    expect(await a.take('k', now + 60_000)).toBe(true)
  })

  it('the in-memory limiter still works for tests and tooling', () => {
    const l = new RateLimiter(1, 1000)
    expect(l.take('x', 0)).toBe(true)
    expect(l.take('x', 1)).toBe(false)
  })
})

describe('Reads +18', () => {
  const book = (characters: {name: string; age: number}[]) =>
    t.call('POST', '/creator/books', AUTHOR, {title: 'Story', characters})

  it('refuses any character under 18, in the API and in the database', async () => {
    const r = await book([{name: 'Ana', age: 17}])
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('characters_must_be_adults')
    const ok = await book([{name: 'Ana', age: 18}])
    expect(ok.status).toBe(200)
    const direct = t.db.query(
      `insert into adult_book_characters (id, book_id, name, age) values ('x', $1, 'Kid', 17)`,
      [ok.body.bookId],
    )
    await expect(direct).rejects.toThrow()
    const add = await t.call(
      'POST',
      `/creator/books/${ok.body.bookId}/characters`,
      AUTHOR,
      {name: 'Bia', age: 16},
    )
    expect(add.status).toBe(400)
  })

  it('requires an approved creator to write', async () => {
    const r = await t.call('POST', '/creator/books', ME, {
      title: 'x',
      characters: [{name: 'A', age: 30}],
    })
    expect(r.status).toBe(403)
  })

  it('only publishes a book that has characters and a part', async () => {
    const {bookId} = (await book([{name: 'Ana', age: 27}])).body
    expect(
      (await t.call('POST', `/creator/books/${bookId}/publish`, AUTHOR)).status,
    ).toBe(400)
    await t.call('POST', `/creator/books/${bookId}/parts`, AUTHOR, {
      body: 'Part one',
    })
    expect(
      (await t.call('POST', `/creator/books/${bookId}/publish`, AUTHOR)).status,
    ).toBe(200)
  })

  it('lists and reads published books only; drafts are invisible', async () => {
    const draft = (await book([{name: 'Ana', age: 27}])).body.bookId
    const pub = (await book([{name: 'Leo', age: 30}])).body.bookId
    await t.call('POST', `/creator/books/${pub}/parts`, AUTHOR, {
      title: 'One',
      body: 'Hello',
    })
    await t.call('POST', `/creator/books/${pub}/publish`, AUTHOR)
    const list = (await t.call('GET', '/reads/books', ME)).body.books
    expect(list.map((b: any) => b.id)).toEqual([pub])
    expect((await t.call('GET', `/reads/books/${draft}`, ME)).status).toBe(404)
    const detail = (await t.call('GET', `/reads/books/${pub}`, ME)).body
    expect(detail.characters).toEqual([{name: 'Leo', age: 30}])
    const part = await t.call('GET', `/reads/books/${pub}/parts/1`, ME)
    expect(part.body).toMatchObject({number: 1, body: 'Hello'})
    expect(
      (await t.call('GET', `/reads/books/${pub}/parts/9`, ME)).status,
    ).toBe(404)
  })

  it('hides books of muted or blocked creators', async () => {
    const id = (await book([{name: 'Ana', age: 27}])).body.bookId
    await t.call('POST', `/creator/books/${id}/parts`, AUTHOR, {body: 'x'})
    await t.call('POST', `/creator/books/${id}/publish`, AUTHOR)
    await t.call('PUT', `/me/adult/mutes/${AUTHOR}`, ME)
    expect((await t.call('GET', '/reads/books', ME)).body.books).toEqual([])
    await t.call('DELETE', `/me/adult/mutes/${AUTHOR}`, ME)
    await t.call('PUT', `/me/adult/blocks/${AUTHOR}`, ME)
    expect((await t.call('GET', `/reads/books/${id}`, ME)).status).toBe(404)
  })

  it("does not let a stranger edit someone else's book", async () => {
    const id = (await book([{name: 'Ana', age: 27}])).body.bookId
    await t.approvedCreator(OTHER, 'fother')
    expect(
      (
        await t.call('POST', `/creator/books/${id}/parts`, OTHER, {
          body: 'hijack',
        })
      ).status,
    ).toBe(404)
  })
})

describe('Visionboard +18', () => {
  const image = async (owner = ME) =>
    (await t.upload(owner, 'image', 'poster', 'image/png', f.poster))
      .assetId as string

  it('boards are private by default and invisible to others', async () => {
    const {boardId} = (
      await t.call('POST', '/me/adult/boards', ME, {name: 'Mine'})
    ).body
    expect(
      (await t.call('GET', `/adult/boards/${boardId}`, OTHER)).status,
    ).toBe(404)
    expect((await t.call('GET', '/adult/boards', OTHER)).body.boards).toEqual(
      [],
    )
    await t.call('PATCH', `/me/adult/boards/${boardId}`, ME, {
      visibility: 'public',
    })
    expect(
      (await t.call('GET', `/adult/boards/${boardId}`, OTHER)).status,
    ).toBe(200)
    expect(
      (await t.call('GET', '/adult/boards', OTHER)).body.boards,
    ).toHaveLength(1)
  })

  it("adds only the owner's own ready images and serves them as sensitive", async () => {
    // Only approved creators can upload media today (see media/routes.ts).
    await t.approvedCreator(ME, 'fme')
    await t.approvedCreator(OTHER, 'fother')
    const {boardId} = (
      await t.call('POST', '/me/adult/boards', ME, {name: 'Mine'})
    ).body
    const mine = await image(ME)
    const theirs = await image(OTHER)
    expect(
      (
        await t.call('POST', `/me/adult/boards/${boardId}/items`, ME, {
          mediaAssetId: theirs,
        })
      ).status,
    ).toBe(404)
    const add = await t.call('POST', `/me/adult/boards/${boardId}/items`, ME, {
      mediaAssetId: mine,
      tone: 'warm',
    })
    expect(add.status).toBe(200)
    expect(
      (
        await t.call('POST', `/me/adult/boards/${boardId}/items`, ME, {
          mediaAssetId: mine,
        })
      ).status,
    ).toBe(409)
    const view = (await t.call('GET', `/adult/boards/${boardId}`, ME)).body
    expect(view.items).toHaveLength(1)
    expect(view.items[0]).toMatchObject({tone: 'warm', sensitive: true})
    expect(view.items[0].imageUrl).toMatch(/^\/stream\//)
    const cool = (await t.call('GET', `/adult/boards/${boardId}?tone=cool`, ME))
      .body
    expect(cool.items).toEqual([])
  })

  it('only the owner can change or delete a board', async () => {
    const {boardId} = (
      await t.call('POST', '/me/adult/boards', ME, {name: 'Mine'})
    ).body
    expect(
      (await t.call('PATCH', `/me/adult/boards/${boardId}`, OTHER, {name: 'x'}))
        .status,
    ).toBe(404)
    await t.call('DELETE', `/me/adult/boards/${boardId}`, OTHER)
    expect(
      (await t.call('GET', '/me/adult/boards', ME)).body.boards,
    ).toHaveLength(1)
  })
})

describe('Drops +18', () => {
  async function drop(withPreview: boolean) {
    const main = await t.upload(
      AUTHOR,
      'video',
      'original',
      'video/mp4',
      f.video,
    )
    const preview = withPreview
      ? await t.upload(AUTHOR, 'video', 'preview', 'video/mp4', f.preview)
      : undefined
    const r = await t.call('POST', '/creator/videos', AUTHOR, {
      title: 'Clip',
      mediaAssetId: main.assetId,
      previewAssetId: preview?.assetId,
      accessPolicy: 'purchase_required',
      publish: true,
      offer: {kind: 'purchase', priceMinor: 1990, currency: 'BRL'},
    })
    return r.body.videoId as string
  }

  it('lists only videos that have a preview clip', async () => {
    const withClip = await drop(true)
    await drop(false)
    const list = (await t.call('GET', '/drops', ME)).body.drops
    expect(list.map((d: any) => d.id)).toEqual([withClip])
  })

  it('the Following tab shows only followed creators; muted ones disappear', async () => {
    await drop(true)
    expect(
      (await t.call('GET', '/drops?tab=following', ME)).body.drops,
    ).toEqual([])
    await t.call('PUT', `/me/adult/follows/${AUTHOR}`, ME)
    expect(
      (await t.call('GET', '/drops?tab=following', ME)).body.drops,
    ).toHaveLength(1)
    await t.call('PUT', `/me/adult/mutes/${AUTHOR}`, ME)
    expect((await t.call('GET', '/drops', ME)).body.drops).toEqual([])
  })

  it('requires age verification', async () => {
    expect((await t.call('GET', '/drops', NEWBIE)).status).toBe(403)
  })
})
