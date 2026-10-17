import {diversifyChannels} from '#/lib/views/diversify'
import {
  formatDuration,
  formatRelativePt,
  formatSubscriberLabel,
  formatViewLabel,
  formatWatchingLabel,
  knownDurationSeconds,
  knownViewCount,
} from '#/lib/views/format'

describe('views format', () => {
  it('formats views with pt-BR singular and plural and hides missing data', () => {
    expect(formatViewLabel(1)).toBe('1 visualização')
    expect(formatViewLabel(2)).toBe('2 visualizações')
    expect(formatViewLabel(1500)).toBe('1,5 mil visualizações')
    expect(formatViewLabel(1_000_000)).toBe('1 milhão visualizações')
    expect(formatViewLabel(3_100_000)).toBe('3,1 milhões visualizações')
    expect(formatViewLabel(0)).toBeUndefined()
    expect(formatViewLabel(undefined)).toBeUndefined()
    expect(formatViewLabel(null)).toBeUndefined()
  })

  it('does not treat the local placeholder as a public view count', () => {
    expect(knownViewCount({uri: 'at://x'})).toBeUndefined()
    expect(knownViewCount({viewCount: 0})).toBeUndefined()
    expect(knownViewCount({viewCount: 12})).toBe(12)
  })

  it('formats subscribers, including a known zero, and hides a missing profile', () => {
    expect(formatSubscriberLabel(1)).toBe('1 inscrito')
    expect(formatSubscriberLabel(84500)).toBe('84,5 mil inscritos')
    expect(formatSubscriberLabel(0)).toBe('0 inscritos')
    expect(formatSubscriberLabel(undefined)).toBeUndefined()
  })

  it('formats live viewers without a zero', () => {
    expect(formatWatchingLabel(1)).toBe('1 pessoa assistindo')
    expect(formatWatchingLabel(1520)).toBe('1,5 mil pessoas assistindo')
    expect(formatWatchingLabel(0)).toBeUndefined()
  })

  it('formats durations only when known', () => {
    expect(formatDuration(18 * 60 + 42)).toBe('18:42')
    expect(formatDuration(2 * 3600 + 1 * 60 + 33)).toBe('2:01:33')
    expect(formatDuration(undefined)).toBeUndefined()
    expect(knownDurationSeconds(undefined)).toBeUndefined()
    expect(knownDurationSeconds({duration: 0})).toBeUndefined()
    expect(knownDurationSeconds({duration: 90})).toBe(90)
  })

  it('formats relative dates in pt-BR', () => {
    const now = Date.parse('2026-10-13T12:00:00Z')
    expect(formatRelativePt('2026-10-12T12:00:00Z', now)).toMatch(/dia/)
    expect(formatRelativePt(undefined, now)).toBeUndefined()
  })
})

describe('diversifyChannels', () => {
  it('caps each channel and does not place the same one twice in a row', () => {
    const items = ['a', 'a', 'a', 'b', 'b', 'c'].map((author, index) => ({
      author,
      index,
    }))
    const result = diversifyChannels(items, item => item.author)
    expect(result.filter(item => item.author === 'a')).toHaveLength(2)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].author).not.toBe(result[i - 1].author)
    }
  })
})
