import {
  getPostTopics,
  getRelatedMedia,
  getVideoExperience,
  isMediaPost,
} from '#/lib/media/experiences'
import {type FeedPostSliceItem} from '#/state/queries/post-feed'

function image(
  uri: string,
  tags: string[] = [],
  hidden = false,
): FeedPostSliceItem {
  const record = {
    $type: 'app.bsky.feed.post',
    text: '',
    createdAt: '2026-01-01T00:00:00Z',
    tags,
  }
  return {
    uri,
    _reactKey: uri,
    record,
    post: {
      uri,
      cid: 'cid',
      author: {did: uri, handle: 'example.test'},
      indexedAt: record.createdAt,
      record,
      embed: {
        $type: 'app.bsky.embed.images#view',
        images: [
          {
            thumb: 'https://example.test/thumb',
            fullsize: 'https://example.test/full',
            alt: '',
          },
        ],
      },
    },
    moderation: {ui: () => ({filter: hidden})},
  } as unknown as FeedPostSliceItem
}

describe('shared media experiences', () => {
  it('keeps videos with unknown duration available without equating vertical with short', () => {
    expect(getVideoExperience({aspectRatio: {width: 9, height: 16}})).toBe(
      'both',
    )
    expect(
      getVideoExperience({
        durationSeconds: 480,
        aspectRatio: {width: 9, height: 16},
      }),
    ).toBe('video')
    expect(
      getVideoExperience({
        durationSeconds: 45,
        aspectRatio: {width: 9, height: 16},
      }),
    ).toBe('drops')
  })
  it('prioritizes creator intent and accepts configurable thresholds', () => {
    expect(
      getVideoExperience({creatorMode: 'video', durationSeconds: 20}),
    ).toBe('video')
    expect(
      getVideoExperience({creatorMode: 'drop', durationSeconds: 480}),
    ).toBe('drops')
    expect(
      getVideoExperience(
        {durationSeconds: 120},
        {shortMaxSeconds: 30, longMinSeconds: 100},
      ),
    ).toBe('video')
    expect(getVideoExperience({durationSeconds: NaN})).toBe('both')
  })
  it('retains canonical object identity and excludes hidden/duplicate/self recommendations', () => {
    const root = image('root', ['Art'])
    const unrelated = image('other')
    const related = image('related', ['art'])
    const hidden = image('hidden', ['art'], true)
    const result = getRelatedMedia(
      root.post,
      [root, unrelated, hidden, related, related],
      'images',
    )
    expect(result).toEqual([related, unrelated])
    expect(result[0]).toBe(related)
    expect(isMediaPost(hidden, 'images')).toBe(false)
    expect(getPostTopics(root.post)).toEqual(['art'])
  })
  it('recognizes media attached to a quote without creating a second object', () => {
    const item = image('quoted')
    item.post.embed = {
      $type: 'app.bsky.embed.recordWithMedia#view',
      media: item.post.embed,
      record: {},
    } as typeof item.post.embed
    expect(isMediaPost(item, 'images')).toBe(true)
  })
})
