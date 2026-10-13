import {
  isAtLeast18,
  PORTAL_SEED,
  QUARANTINE_CONTENT_HASH,
  scanBeforePublish,
  selectPortalItems,
  selectWebResults,
  WEB_SEED,
} from '#/lib/adult/portal/model'
import {
  isAdultFeedCandidate,
  postMayEnterSocialFeed,
  readHideAdultFromMain,
  writeHideAdultFromMain,
} from '#/lib/moderation/adultContent'

const formats = {
  post: true,
  video: true,
  article: true,
  visionboard: true,
  web: false,
}
const categories = {
  artistico: true,
  literatura: true,
  explicito: false,
  fetiche: false,
}

describe('age gate', () => {
  const now = new Date(2026, 9, 13)

  it('accepts a birthday that is exactly 18 years ago', () => {
    expect(isAtLeast18(13, 10, 2008, now)).toBe(true)
  })

  it('rejects the day before an 18th birthday', () => {
    expect(isAtLeast18(14, 10, 2008, now)).toBe(false)
  })

  it('rejects impossible dates', () => {
    expect(isAtLeast18(31, 2, 2000, now)).toBe(false)
    expect(isAtLeast18(1, 13, 2000, now)).toBe(false)
  })
})

describe('portal catalog', () => {
  it('shows the curated sample, including the pinned web card, with web format off', () => {
    const items = selectPortalItems({
      items: PORTAL_SEED,
      format: 'all',
      query: '',
      lane: 'foryou',
      savedIds: [],
      mutedWords: '',
      formats,
      categories,
    })
    expect(items).toHaveLength(8)
    expect(items.some(item => item.id === 'pi-galeria')).toBe(true)
  })

  it('drops articles and books when that format is off, and honors muted words', () => {
    const items = selectPortalItems({
      items: PORTAL_SEED,
      format: 'all',
      query: '',
      lane: 'foryou',
      savedIds: [],
      mutedWords: 'veludo',
      formats: {...formats, article: false},
      categories,
    })
    expect(items.map(item => item.id)).not.toContain('pi-desejo')
    expect(items.map(item => item.id)).not.toContain('pi-contos')
    expect(items.map(item => item.id)).not.toContain('pi-mood')
  })

  it('keeps every seed item flagged adult', () => {
    expect(PORTAL_SEED.every(item => item.adult)).toBe(true)
  })

  it('filters the external sample and never implies a crawl', () => {
    expect(selectWebResults(WEB_SEED, 'fotografia', 'Todos')).toHaveLength(1)
    expect(selectWebResults(WEB_SEED, '', 'Saúde')[0].domain).toBe(
      'revista-exemplo.com.br',
    )
  })
})

describe('hash hook', () => {
  it('passes ordinary drafts and quarantines the sentinel hash', () => {
    expect(scanBeforePublish('hash:ensaio')).toBe('ok')
    expect(scanBeforePublish(undefined)).toBe('ok')
    expect(scanBeforePublish(QUARANTINE_CONTENT_HASH)).toBe('quarantine')
  })
})

describe('social feed isolation', () => {
  const adultPost = {labels: [{val: 'sexual'}], record: {adult: true}}
  const plainPost = {record: {text: 'bom dia'}}

  it('recognizes labels and the adult flag', () => {
    expect(isAdultFeedCandidate(adultPost)).toBe(true)
    expect(isAdultFeedCandidate({record: {aquaAdult: true}})).toBe(true)
    expect(isAdultFeedCandidate(plainPost)).toBe(false)
  })

  it('hides adult posts until the viewer opts in and turns off hide-from-main', () => {
    expect(
      postMayEnterSocialFeed(adultPost, {
        adultContentEnabled: false,
        hideFromMain: false,
      }),
    ).toBe(false)
    expect(
      postMayEnterSocialFeed(adultPost, {
        adultContentEnabled: true,
        hideFromMain: true,
      }),
    ).toBe(false)
    expect(
      postMayEnterSocialFeed(adultPost, {
        adultContentEnabled: true,
        hideFromMain: false,
      }),
    ).toBe(true)
    expect(
      postMayEnterSocialFeed(plainPost, {
        adultContentEnabled: false,
        hideFromMain: true,
      }),
    ).toBe(true)
  })

  it('defaults hide-from-main to on', () => {
    writeHideAdultFromMain(true)
    expect(readHideAdultFromMain()).toBe(true)
    writeHideAdultFromMain(false)
    expect(readHideAdultFromMain()).toBe(false)
    writeHideAdultFromMain(true)
  })
})
