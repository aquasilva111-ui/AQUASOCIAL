import {
  replyRefsFor,
  sortComments,
  validPinnedUri,
} from '#/lib/view-watch/comments'

const VIDEO = 'at://did:plc:creator/app.bsky.feed.post/video1'
const c = (id: string, likeCount: number, day: number, replyCount = 0) => ({
  uri: `at://did:plc:x/app.bsky.feed.post/${id}`,
  indexedAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`,
  likeCount,
  replyCount,
})

describe('sorting comments', () => {
  const list = [c('a', 1, 10), c('b', 9, 1), c('c', 9, 5, 3), c('d', 0, 20)]

  it('top: likes, then replies, then newest', () => {
    expect(sortComments(list, 'top').map(x => x.uri.slice(-1))).toEqual([
      'c',
      'b',
      'a',
      'd',
    ])
  })

  it('recent: newest first', () => {
    expect(sortComments(list, 'recent').map(x => x.uri.slice(-1))).toEqual([
      'd',
      'a',
      'c',
      'b',
    ])
  })

  it('the pinned comment always comes first', () => {
    const pinned = c('d', 0, 20).uri
    expect(sortComments(list, 'top', pinned)[0].uri).toBe(pinned)
    expect(sortComments(list, 'recent', c('b', 9, 1).uri)[0].uri).toBe(
      c('b', 9, 1).uri,
    )
  })
})

describe('pinned comment validation', () => {
  const comment = 'at://did:plc:fan/app.bsky.feed.post/r1'
  const parents: Record<string, string> = {[comment]: VIDEO}
  const parentOf = (u: string) => parents[u]

  it('accepts a pin naming this video and a direct reply to it', () => {
    expect(
      validPinnedUri(
        {subject: VIDEO, comment: {uri: comment}},
        VIDEO,
        parentOf,
      ),
    ).toBe(comment)
  })

  it('rejects pins for other videos, non-replies and garbage', () => {
    expect(
      validPinnedUri(
        {
          subject: 'at://did:plc:creator/app.bsky.feed.post/other',
          comment: {uri: comment},
        },
        VIDEO,
        parentOf,
      ),
    ).toBeUndefined()
    expect(
      validPinnedUri(
        {
          subject: VIDEO,
          comment: {uri: 'at://did:plc:x/app.bsky.feed.post/unrelated'},
        },
        VIDEO,
        parentOf,
      ),
    ).toBeUndefined()
    for (const bad of [
      undefined,
      null,
      {},
      {subject: VIDEO},
      {subject: VIDEO, comment: {uri: 'javascript:1'}},
    ])
      expect(validPinnedUri(bad, VIDEO, parentOf)).toBeUndefined()
  })
})

describe('reply refs', () => {
  it('a top-level video is both root and parent', () => {
    expect(replyRefsFor({uri: VIDEO, cid: 'cid1', record: {}})).toEqual({
      root: {uri: VIDEO, cid: 'cid1'},
      parent: {uri: VIDEO, cid: 'cid1'},
    })
  })

  it('a video that is itself a reply keeps the thread root', () => {
    const root = {uri: 'at://did:plc:y/app.bsky.feed.post/root', cid: 'cidR'}
    expect(
      replyRefsFor({uri: VIDEO, cid: 'cid1', record: {reply: {root}}}),
    ).toEqual({root, parent: {uri: VIDEO, cid: 'cid1'}})
  })
})
