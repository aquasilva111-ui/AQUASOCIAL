import {
  ADULT_QUERY_NAMESPACE,
  adultQueryKey,
  adultStorageKey,
  assertAdultQueryKey,
  canLoadAdultMedia,
  classifyDataDomain,
  isAdultQueryKey,
  isAdultStorageKey,
} from '#/lib/adult/isolation'
import {
  clearAdultActionHistory,
  getAdultActionHistory,
  likeAdult,
  searchAdult,
  seenAdult,
  watchedAdult,
} from '#/state/adult/actionHistory'
import {getActionHistory} from '#/state/userActionHistory'

describe('adult data classification', () => {
  it('classifies private adult domains as adult_private', () => {
    for (const domain of [
      'adult.watchHistory',
      'adult.searchHistory',
      'adult.likes',
      'adult.subscriptions',
      'adult.purchases',
      'adult.library',
      'adult.messages',
    ]) {
      expect(classifyDataDomain(domain)).toBe('adult_private')
    }
  })

  it('does not classify unknown domains as adult', () => {
    expect(classifyDataDomain('social.feed')).toBe('shared')
  })
})

describe('cache/storage namespacing', () => {
  it('prefixes adult query keys with the adult namespace', () => {
    const key = adultQueryKey('feed', 'cursor-1')
    expect(key[0]).toBe(ADULT_QUERY_NAMESPACE)
    expect(isAdultQueryKey(key)).toBe(true)
  })

  it('rejects social query keys as adult keys', () => {
    expect(isAdultQueryKey(['post-feed', 'following'])).toBe(false)
    expect(() => assertAdultQueryKey(['post-feed', 'following'])).toThrow()
  })

  it('namespaces adult storage keys', () => {
    const key = adultStorageKey('searchHistory')
    expect(key).toBe('adult.searchHistory')
    expect(isAdultStorageKey(key)).toBe(true)
    expect(isAdultStorageKey('searchHistory')).toBe(false)
  })
})

describe('recommendation firewall', () => {
  it('adult interactions never touch the social action history', () => {
    const socialBefore = getActionHistory()

    likeAdult(['at://did:plc:x/app.bsky.feed.post/1'])
    seenAdult(['at://did:plc:x/app.bsky.feed.post/1'])
    searchAdult(['sensitive term'])
    watchedAdult(['at://did:plc:x/app.bsky.feed.post/2'])

    const socialAfter = getActionHistory()
    expect(socialAfter.likes).toEqual(socialBefore.likes)
    expect(socialAfter.seen).toEqual(socialBefore.seen)

    const adult = getAdultActionHistory()
    expect(adult.likes).toContain('at://did:plc:x/app.bsky.feed.post/1')
    expect(adult.searches).toContain('sensitive term')
    expect(adult.watched).toContain('at://did:plc:x/app.bsky.feed.post/2')
  })

  it('clears adult history on exit', () => {
    likeAdult(['at://did:plc:x/app.bsky.feed.post/3'])
    clearAdultActionHistory()
    const adult = getAdultActionHistory()
    expect(adult.likes).toEqual([])
    expect(adult.seen).toEqual([])
    expect(adult.searches).toEqual([])
    expect(adult.watched).toEqual([])
  })
})

describe('media prefetch guard', () => {
  it('blocks adult media outside an enabled adult context', () => {
    expect(canLoadAdultMedia(false)).toBe(false)
    // @ts-expect-error undefined must never mean allowed
    expect(canLoadAdultMedia(undefined)).toBe(false)
    expect(canLoadAdultMedia(true)).toBe(true)
  })
})
