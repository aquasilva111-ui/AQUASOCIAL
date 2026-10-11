const HOT = 'at://did:plc:aqua/app.bsky.feed.generator/em-alta'

function loadConstants(uri: string | undefined) {
  const prev = process.env.EXPO_PUBLIC_AQUA_HOT_FEED_URI
  if (uri === undefined) delete process.env.EXPO_PUBLIC_AQUA_HOT_FEED_URI
  else process.env.EXPO_PUBLIC_AQUA_HOT_FEED_URI = uri
  let mod: typeof import('#/lib/constants') | undefined
  jest.isolateModules(() => {
    mod = require('#/lib/constants')
  })
  if (prev === undefined) delete process.env.EXPO_PUBLIC_AQUA_HOT_FEED_URI
  else process.env.EXPO_PUBLIC_AQUA_HOT_FEED_URI = prev
  return mod!
}

describe('Em alta na Aqua as default feed', () => {
  it('is the first recommended pinned feed when configured', () => {
    const c = loadConstants(HOT)
    expect(c.AQUA_HOT_SAVED_FEED).toEqual({
      type: 'feed',
      value: HOT,
      pinned: true,
    })
    expect(c.RECOMMENDED_SAVED_FEEDS.map(f => f.value)).toEqual([
      HOT,
      c.DISCOVER_SAVED_FEED.value,
      'following',
    ])
  })

  it('changes nothing when not configured', () => {
    const c = loadConstants(undefined)
    expect(c.AQUA_HOT_SAVED_FEED).toBeUndefined()
    expect(c.RECOMMENDED_SAVED_FEEDS).toHaveLength(2)
  })
})
