import {beforeAll, beforeEach, describe, expect, it} from 'vitest'

import {createTestApp, did, type TestApp} from './helpers.js'
import {fixtures} from './media-fixtures.js'

const ANA = did('nana')
const BEN = did('nben')
const CAT = did('ncat')
const NEWBIE = did('nnewbie')

let t: TestApp
let f: ReturnType<typeof fixtures>

beforeAll(() => {
  f = fixtures()
})

beforeEach(async () => {
  t = await createTestApp()
  for (const d of [ANA, BEN, CAT]) await t.verifiedUser(d)
})

const post = async (who: string, body: string) =>
  (await t.call('POST', '/adult/posts', who, {body})).body.postId as string
const ids = (res: any) => res.body.posts.map((p: any) => p.id)

describe('posts', () => {
  it('creates, reads and soft-deletes a post', async () => {
    const id = await post(ANA, 'hello')
    const got = await t.call('GET', `/adult/posts/${id}`, BEN)
    expect(got.body.post).toMatchObject({
      id,
      body: 'hello',
      author: {did: ANA},
      engagement: {likes: 0, reposts: 0, comments: 0, liked: false},
    })
    expect((await t.call('DELETE', `/adult/posts/${id}`, BEN)).status).toBe(200)
    expect((await t.call('GET', `/adult/posts/${id}`, BEN)).status).toBe(200)
    await t.call('DELETE', `/adult/posts/${id}`, ANA)
    expect((await t.call('GET', `/adult/posts/${id}`, BEN)).status).toBe(404)
  })

  it('refuses empty posts and unverified users', async () => {
    expect(
      (await t.call('POST', '/adult/posts', ANA, {body: '  '})).status,
    ).toBe(400)
    expect(
      (await t.call('POST', '/adult/posts', NEWBIE, {body: 'x'})).status,
    ).toBe(403)
  })

  it("attaches the author's own ready images, served as sensitive", async () => {
    await t.approvedCreator(ANA, 'ana')
    const img = (await t.upload(ANA, 'image', 'poster', 'image/png', f.poster))
      .assetId
    const r = await t.call('POST', '/adult/posts', ANA, {
      body: 'pic',
      mediaAssetIds: [img],
    })
    expect(r.status).toBe(200)
    const got = (await t.call('GET', `/adult/posts/${r.body.postId}`, BEN)).body
      .post
    expect(got.media).toHaveLength(1)
    expect(got.media[0]).toMatchObject({sensitive: true})
    expect(got.media[0].url).toMatch(/^\/stream\//)
    // someone else's image cannot be attached
    const other = await t.call('POST', '/adult/posts', BEN, {
      body: 'steal',
      mediaAssetIds: [img],
    })
    expect(other.status).toBe(404)
  })
})

describe('feed', () => {
  it('discover shows everyone, newest first, and pages with a cursor', async () => {
    const a = await post(ANA, 'one')
    const b = await post(BEN, 'two')
    const res = await t.call('GET', '/adult/feed?tab=discover', CAT)
    expect(ids(res)).toEqual([b, a])
    expect(res.body.next).toBeNull()
  })

  it('following shows followed authors, own posts and their reposts', async () => {
    const a = await post(ANA, 'from ana')
    const b = await post(BEN, 'from ben')
    const c = await post(CAT, 'from cat')
    expect(ids(await t.call('GET', '/adult/feed?tab=following', CAT))).toEqual([
      c,
    ])
    await t.call('PUT', `/me/adult/follows/${ANA}`, CAT)
    expect(ids(await t.call('GET', '/adult/feed?tab=following', CAT))).toEqual([
      c,
      a,
    ])
    // Ana reposts Ben: it appears for her followers, marked as a repost
    await t.call('PUT', `/adult/engage/post/${b}/repost`, ANA)
    const feed = await t.call('GET', '/adult/feed?tab=following', CAT)
    const repost = feed.body.posts.find((p: any) => p.id === b)
    expect(repost.repostedBy.did).toBe(ANA)
  })

  it('hides muted and blocked authors', async () => {
    const a = await post(ANA, 'ana')
    await post(BEN, 'ben')
    await t.call('PUT', `/me/adult/mutes/${BEN}`, CAT)
    expect(ids(await t.call('GET', '/adult/feed?tab=discover', CAT))).toEqual([
      a,
    ])
    await t.call('PUT', `/me/adult/blocks/${ANA}`, CAT)
    expect(ids(await t.call('GET', '/adult/feed?tab=discover', CAT))).toEqual(
      [],
    )
    // and blocking is mutual: Ana no longer sees Cat's posts either
    const cat = await post(CAT, 'cat')
    const seenByAna = ids(await t.call('GET', '/adult/feed?tab=discover', ANA))
    expect(seenByAna).toHaveLength(2) // her own post and Ben's
    expect(seenByAna).not.toContain(cat)
  })

  it('paginates with the cursor', async () => {
    for (let i = 0; i < 22; i++) await post(ANA, `p${i}`)
    const first = await t.call('GET', '/adult/feed?tab=discover', BEN)
    expect(first.body.posts).toHaveLength(20)
    expect(first.body.next).toBeTruthy()
    const second = await t.call(
      'GET',
      `/adult/feed?tab=discover&before=${encodeURIComponent(first.body.next)}`,
      BEN,
    )
    expect(second.body.posts).toHaveLength(2)
    expect(second.body.next).toBeNull()
    const all = [...ids(first), ...ids(second)]
    expect(new Set(all).size).toBe(22)
  })
})

describe('engagement works on every kind of +18 content', () => {
  it('likes and reposts are idempotent and counted per viewer', async () => {
    const id = await post(ANA, 'x')
    await t.call('PUT', `/adult/engage/post/${id}/like`, BEN)
    await t.call('PUT', `/adult/engage/post/${id}/like`, BEN)
    await t.call('PUT', `/adult/engage/post/${id}/like`, CAT)
    const asBen = (await t.call('GET', `/adult/engage/post/${id}`, BEN)).body
    expect(asBen).toMatchObject({likes: 2, liked: true, reposted: false})
    await t.call('DELETE', `/adult/engage/post/${id}/like`, BEN)
    const asBen2 = (await t.call('GET', `/adult/engage/post/${id}`, BEN)).body
    expect(asBen2).toMatchObject({likes: 1, liked: false})
  })

  it('a like leaves a signal; unknown or hidden targets are 404', async () => {
    const id = await post(ANA, 'x')
    await t.call('PUT', `/adult/engage/post/${id}/like`, BEN)
    const kinds = (
      await t.call('GET', '/me/adult/signals', BEN)
    ).body.signals.map((s: any) => s.kind)
    expect(kinds).toEqual(['like'])
    expect(
      (await t.call('PUT', '/adult/engage/post/nope/like', BEN)).status,
    ).toBe(404)
    await t.call('PUT', `/me/adult/blocks/${ANA}`, BEN)
    expect(
      (await t.call('PUT', `/adult/engage/post/${id}/like`, BEN)).status,
    ).toBe(404)
  })

  it('works on a video, a book and a public pin', async () => {
    await t.approvedCreator(ANA, 'ana')
    const main = await t.upload(ANA, 'video', 'original', 'video/mp4', f.video)
    const vid = (
      await t.call('POST', '/creator/videos', ANA, {
        title: 'V',
        mediaAssetId: main.assetId,
        accessPolicy: 'free',
        publish: true,
      })
    ).body.videoId
    expect(
      (await t.call('PUT', `/adult/engage/video/${vid}/like`, BEN)).status,
    ).toBe(200)

    const book = (
      await t.call('POST', '/creator/books', ANA, {
        title: 'B',
        characters: [{name: 'Z', age: 30}],
      })
    ).body.bookId
    expect(
      (await t.call('PUT', `/adult/engage/book/${book}/like`, BEN)).status,
    ).toBe(404) // draft
    await t.call('POST', `/creator/books/${book}/parts`, ANA, {body: 'x'})
    await t.call('POST', `/creator/books/${book}/publish`, ANA)
    expect(
      (await t.call('PUT', `/adult/engage/book/${book}/repost`, BEN)).status,
    ).toBe(200)

    const board = (await t.call('POST', '/me/adult/boards', ANA, {name: 'b'}))
      .body.boardId
    const img = (await t.upload(ANA, 'image', 'poster', 'image/png', f.poster))
      .assetId
    const pin = (
      await t.call('POST', `/me/adult/boards/${board}/items`, ANA, {
        mediaAssetId: img,
      })
    ).body.itemId
    expect(
      (await t.call('PUT', `/adult/engage/pin/${pin}/like`, BEN)).status,
    ).toBe(404) // private board
    await t.call('PATCH', `/me/adult/boards/${board}`, ANA, {
      visibility: 'public',
    })
    expect(
      (await t.call('PUT', `/adult/engage/pin/${pin}/like`, BEN)).status,
    ).toBe(200)
  })
})

describe('comments', () => {
  it('lists, adds and removes comments', async () => {
    const id = await post(ANA, 'x')
    const c = await t.call('POST', `/adult/engage/post/${id}/comments`, BEN, {
      body: 'nice',
    })
    expect(c.status).toBe(200)
    const list = (await t.call('GET', `/adult/engage/post/${id}/comments`, CAT))
      .body.comments
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({body: 'nice', author: {did: BEN}})
    expect(
      (await t.call('GET', `/adult/engage/post/${id}`, CAT)).body.comments,
    ).toBe(1)
    // a stranger cannot remove it; the author and the post owner can
    expect(
      (await t.call('DELETE', `/adult/comments/${c.body.commentId}`, CAT))
        .status,
    ).toBe(403)
    expect(
      (await t.call('DELETE', `/adult/comments/${c.body.commentId}`, ANA))
        .status,
    ).toBe(200)
    expect(
      (await t.call('GET', `/adult/engage/post/${id}/comments`, CAT)).body
        .comments,
    ).toEqual([])
  })

  it("refuses empty comments and hides muted authors' comments", async () => {
    const id = await post(ANA, 'x')
    expect(
      (
        await t.call('POST', `/adult/engage/post/${id}/comments`, BEN, {
          body: ' ',
        })
      ).status,
    ).toBe(400)
    await t.call('POST', `/adult/engage/post/${id}/comments`, BEN, {body: 'hi'})
    await t.call('PUT', `/me/adult/mutes/${BEN}`, CAT)
    expect(
      (await t.call('GET', `/adult/engage/post/${id}/comments`, CAT)).body
        .comments,
    ).toEqual([])
  })
})

describe('profiles', () => {
  it('shows counts, the viewer relation and the display name', async () => {
    await t.call('PUT', '/me/adult/profile', ANA, {
      displayName: 'Ana',
      bio: 'olá',
    })
    await post(ANA, 'one')
    await t.call('PUT', `/me/adult/follows/${ANA}`, BEN)
    const p = (await t.call('GET', `/adult/users/${ANA}`, BEN)).body
    expect(p).toMatchObject({
      did: ANA,
      displayName: 'Ana',
      bio: 'olá',
      counts: {posts: 1, followers: 1, following: 0},
      viewer: {following: true, muted: false, blocked: false, self: false},
    })
    expect(
      (await t.call('GET', `/adult/users/${ANA}/posts`, BEN)).body.posts,
    ).toHaveLength(1)
  })

  it("a blocked user cannot see the blocker's profile", async () => {
    await t.call('PUT', `/me/adult/blocks/${BEN}`, ANA)
    expect((await t.call('GET', `/adult/users/${ANA}`, BEN)).status).toBe(404)
  })
})

describe('moderation sees social posts and comments', () => {
  it('a post can be reported and a removal hides it', async () => {
    const id = await post(ANA, 'bad')
    const r = await t.call('POST', '/reports', BEN, {
      targetType: 'content',
      resourceType: 'social_post',
      resourceId: id,
      reasonCode: 'other',
    })
    expect(r.status).toBe(200)
    const cm = (
      await t.call('POST', `/adult/engage/post/${id}/comments`, CAT, {
        body: 'rude',
      })
    ).body.commentId
    const rc = await t.call('POST', '/reports', BEN, {
      targetType: 'content',
      resourceType: 'social_comment',
      resourceId: cm,
      reasonCode: 'harassment',
    })
    expect(rc.status).toBe(200)
    await t.db.query(
      `update adult_posts set status = 'removed' where id = $1`,
      [id],
    )
    expect((await t.call('GET', `/adult/posts/${id}`, CAT)).status).toBe(404)
    expect(ids(await t.call('GET', '/adult/feed?tab=discover', CAT))).toEqual(
      [],
    )
  })
})
