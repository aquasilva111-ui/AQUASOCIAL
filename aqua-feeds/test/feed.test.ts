import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {createApp} from '../src/app.ts'
import {type Config, loadConfig} from '../src/config.ts'
import {decodeCursor, encodeCursor} from '../src/cursor.ts'
import {createPgliteDb, type Db, migrate} from '../src/db.ts'
import {createFeed} from '../src/feed.ts'
import {applyOps, langMatches, toOps} from '../src/jetstream.ts'
import {createStore, type Store} from '../src/store.ts'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const H = 3_600_000
const cfg: Config = loadConfig({
  AQUA_FEEDS_ENV: 'test',
  FEEDGEN_HOSTNAME: 'feeds.example.com',
  FEEDGEN_PUBLISHER_DID: 'did:plc:aqua',
  JETSTREAM_ENABLED: '0',
  MAX_PER_AUTHOR: '2',
})
const postUri = (did: string, n: number) =>
  `at://${did}/app.bsky.feed.post/p${n}`

let db: Db
let store: Store
let clock = NOW

beforeEach(async () => {
  db = await createPgliteDb()
  await migrate(db)
  store = createStore(db)
  clock = NOW
})
afterEach(async () => {
  await db.close()
})

/** n posts de autores diferentes, o i-ésimo com (n - i) curtidas. */
async function seed(n: number) {
  for (let i = 0; i < n; i++) {
    const uri = postUri(`did:plc:a${i}`, i)
    await store.addPost({
      uri,
      author: `did:plc:a${i}`,
      indexedAt: NOW - H,
      isReply: false,
      langs: ['pt'],
    })
    for (let k = 0; k < n - i; k++) {
      await store.addInteraction({
        uri: `at://did:plc:f${k}/app.bsky.feed.like/l${i}-${k}`,
        kind: 'like',
        subject: uri,
        actor: `did:plc:f${k}`,
        createdAt: NOW,
      })
    }
  }
}

describe('cursor', () => {
  it('ida e volta, e recusa lixo', () => {
    expect(decodeCursor(encodeCursor({snapshot: 123, offset: 30}))).toEqual({
      snapshot: 123,
      offset: 30,
    })
    expect(decodeCursor('abc')).toBeUndefined()
    expect(decodeCursor('1::-2')).toBeUndefined()
  })
})

describe('paginação', () => {
  it('percorre o ranking inteiro sem repetir nem pular', async () => {
    await seed(25)
    const feed = createFeed(store, cfg, () => clock)
    const seen: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const page = await feed.skeleton({cursor, limit: 10})
      seen.push(...page.feed.map(f => f.post))
      cursor = page.cursor
      pages++
    } while (cursor && pages < 10)
    expect(pages).toBe(3)
    expect(seen).toHaveLength(25)
    expect(new Set(seen).size).toBe(25)
    expect(seen[0]).toBe(postUri('did:plc:a0', 0))
  })

  it('a página 2 vem do mesmo snapshot mesmo que o ranking mude', async () => {
    await seed(6)
    const feed = createFeed(store, cfg, () => clock)
    const p1 = await feed.skeleton({limit: 3})
    // o último post dispara depois da página 1
    const last = postUri('did:plc:a5', 5)
    for (let k = 0; k < 50; k++) {
      await store.addInteraction({
        uri: `at://did:plc:x${k}/app.bsky.feed.like/z${k}`,
        kind: 'like',
        subject: last,
        actor: `did:plc:x${k}`,
        createdAt: NOW,
      })
    }
    clock = NOW + 10 * 60_000 // snapshot velho: o próximo pedido sem cursor recalcula
    const p2 = await feed.skeleton({cursor: p1.cursor, limit: 3})
    const all = [...p1.feed, ...p2.feed].map(f => f.post)
    expect(new Set(all).size).toBe(6)
    expect(p2.feed.map(f => f.post)).toContain(last)
    const fresh = await feed.skeleton({limit: 1})
    expect(fresh.feed[0]!.post).toBe(last)
  })

  it('aplica o limite por autor', async () => {
    for (let i = 0; i < 5; i++) {
      const uri = postUri('did:plc:same', i)
      await store.addPost({
        uri,
        author: 'did:plc:same',
        indexedAt: NOW - H,
        isReply: false,
        langs: ['pt'],
      })
      await store.addInteraction({
        uri: `at://did:plc:f/app.bsky.feed.like/s${i}`,
        kind: 'like',
        subject: uri,
        actor: 'did:plc:f',
        createdAt: NOW,
      })
    }
    const page = await createFeed(store, cfg, () => clock).skeleton({limit: 30})
    expect(page.feed).toHaveLength(2)
    expect(page.cursor).toBeUndefined()
  })

  it('não conta curtida do próprio autor', async () => {
    const uri = postUri('did:plc:me', 1)
    await store.addPost({
      uri,
      author: 'did:plc:me',
      indexedAt: NOW - H,
      isReply: false,
      langs: ['pt'],
    })
    await store.addInteraction({
      uri: 'at://did:plc:me/app.bsky.feed.like/self',
      kind: 'like',
      subject: uri,
      actor: 'did:plc:me',
      createdAt: NOW,
    })
    const page = await createFeed(store, cfg, () => clock).skeleton({})
    expect(page.feed).toHaveLength(0)
  })

  it('cursor de snapshot expirado devolve lista vazia', async () => {
    await seed(3)
    const page = await createFeed(store, cfg, () => clock).skeleton({
      cursor: encodeCursor({snapshot: 1, offset: 0}),
    })
    expect(page).toEqual({feed: []})
  })
})

describe('jetstream → índice', () => {
  const evt = (
    did: string,
    collection: string,
    rkey: string,
    record?: object,
    operation = 'create',
  ) => ({
    did,
    time_us: NOW * 1000,
    kind: 'commit',
    commit: {operation: operation as 'create', collection, rkey, record},
  })
  const filter = {langs: ['pt'], authorDids: []}

  it('filtra idioma', () => {
    expect(langMatches(['pt-BR'], ['pt'])).toBe(true)
    expect(langMatches(['en'], ['pt'])).toBe(false)
    expect(langMatches(undefined, [])).toBe(true)
  })

  it('indexa post, resposta, curtida, repost e remoção', async () => {
    const post = evt('did:plc:a', 'app.bsky.feed.post', 'p1', {
      text: 'oi',
      langs: ['pt-BR'],
      createdAt: 'x',
    })
    const parent = 'at://did:plc:a/app.bsky.feed.post/p1'
    const reply = evt('did:plc:b', 'app.bsky.feed.post', 'r1', {
      text: 'eae',
      reply: {parent: {uri: parent}, root: {uri: parent}},
    })
    const like = evt('did:plc:c', 'app.bsky.feed.like', 'l1', {
      subject: {uri: parent, cid: 'c'},
    })
    const repost = evt('did:plc:d', 'app.bsky.feed.repost', 'rp1', {
      subject: {uri: parent, cid: 'c'},
    })
    const english = evt('did:plc:e', 'app.bsky.feed.post', 'p2', {
      text: 'hi',
      langs: ['en'],
    })
    for (const e of [post, reply, like, repost, english])
      await applyOps(store, toOps(e, filter))

    const [c] = await store.candidates(NOW, 72)
    expect(c).toMatchObject({uri: parent, likes: 1, reposts: 1, replies: 1})
    expect(await store.candidates(NOW, 72)).toHaveLength(1)

    await applyOps(
      store,
      toOps(
        evt('did:plc:c', 'app.bsky.feed.like', 'l1', undefined, 'delete'),
        filter,
      ),
    )
    expect((await store.candidates(NOW, 72))[0]).toMatchObject({likes: 0})

    await applyOps(
      store,
      toOps(
        evt('did:plc:a', 'app.bsky.feed.post', 'p1', undefined, 'delete'),
        filter,
      ),
    )
    expect(await store.candidates(NOW, 72)).toHaveLength(0)
  })

  it('respeita a lista de autores da rede Aqua', () => {
    const e = evt('did:plc:fora', 'app.bsky.feed.post', 'p', {
      text: 'x',
      langs: ['pt'],
    })
    expect(toOps(e, {langs: ['pt'], authorDids: ['did:plc:aqua1']})).toEqual([])
  })

  it('poda o que passou da retenção', async () => {
    await store.addPost({
      uri: postUri('did:plc:v', 1),
      author: 'did:plc:v',
      indexedAt: NOW - 80 * H,
      isReply: false,
      langs: [],
    })
    await store.addPost({
      uri: postUri('did:plc:n', 1),
      author: 'did:plc:n',
      indexedAt: NOW - H,
      isReply: false,
      langs: [],
    })
    expect(await store.prune(NOW, 72, 60)).toBe(1)
    expect(store.known.has(postUri('did:plc:v', 1))).toBe(false)
  })
})

describe('HTTP', () => {
  it('serve did.json, describeFeedGenerator e getFeedSkeleton', async () => {
    await seed(2)
    const app = createApp(
      cfg,
      createFeed(store, cfg, () => clock),
    )
    const did = await (await app.request('/.well-known/did.json')).json()
    expect(did).toMatchObject({
      id: 'did:web:feeds.example.com',
      service: [
        {
          type: 'BskyFeedGenerator',
          serviceEndpoint: 'https://feeds.example.com',
        },
      ],
    })
    const desc = await (
      await app.request('/xrpc/app.bsky.feed.describeFeedGenerator')
    ).json()
    expect(desc).toEqual({
      did: 'did:web:feeds.example.com',
      feeds: [{uri: 'at://did:plc:aqua/app.bsky.feed.generator/em-alta'}],
    })

    const q = (s: string) =>
      app.request(`/xrpc/app.bsky.feed.getFeedSkeleton?${s}`)
    const ok = await q(`feed=${encodeURIComponent(cfg.feedUri)}&limit=1`)
    const body = await ok.json()
    expect(body.feed).toHaveLength(1)
    expect(body.cursor).toBeTruthy()
    expect((await q('feed=at://x/app.bsky.feed.generator/outro')).status).toBe(
      400,
    )
    expect(
      (await q(`feed=${encodeURIComponent(cfg.feedUri)}&limit=500`)).status,
    ).toBe(400)
    expect(
      (await q(`feed=${encodeURIComponent(cfg.feedUri)}&cursor=lixo`)).status,
    ).toBe(400)
  })
})
