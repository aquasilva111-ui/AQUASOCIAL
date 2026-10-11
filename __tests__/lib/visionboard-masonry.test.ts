import {
  dealIntoBlocks,
  dealIntoColumns,
  gridColumnCount,
} from '#/lib/visionboard/masonry'
import {saveTargetFields, type VisionboardItem} from '#/lib/visionboard/model'

describe('visionboard masonry', () => {
  it('uses 2 columns on phones and up to 5 on wide screens', () => {
    expect(gridColumnCount(375)).toBe(2)
    expect(gridColumnCount(700)).toBe(3)
    expect(gridColumnCount(1000)).toBe(4)
    expect(gridColumnCount(1600)).toBe(5)
  })

  it('deals into the shortest column', () => {
    const cols = dealIntoColumns([2, 1, 1, 1], 2, h => h)
    expect(cols).toEqual([
      [2, 1],
      [1, 1],
    ])
  })

  it('keeps every item, in order, across blocks', () => {
    const items = Array.from({length: 200}, (_, i) => i)
    const weight = (i: number) => 0.6 + ((i * 37) % 10) / 6
    const blocks = dealIntoBlocks(items, 3, weight)
    const seen = blocks.flatMap(b => b.columns.flat()).sort((x, y) => x - y)
    expect(seen).toEqual(items)
  })

  it('leaves smaller seams than fixed-size blocks', () => {
    const items = Array.from({length: 600}, (_, i) => i)
    const weight = (i: number) => 0.6 + ((i * 37) % 11) / 6
    const columns = 4
    const fixedSpread: number[] = []
    for (let s = 0; s + 24 <= items.length; s += 24) {
      const cols = dealIntoColumns(items.slice(s, s + 24), columns, weight)
      const t = cols.map(c => c.reduce((n, i) => n + weight(i), 0))
      fixedSpread.push(Math.max(...t) - Math.min(...t))
    }
    const blocks = dealIntoBlocks(items, columns, weight).slice(0, -1)
    const avg = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length
    expect(avg(blocks.map(b => b.spread))).toBeLessThan(avg(fixedSpread) * 0.7)
    for (const b of blocks) {
      const n = b.columns.flat().length
      expect(n).toBeGreaterThanOrEqual(24)
      expect(n).toBeLessThanOrEqual(36)
    }
  })
})

describe('save target of a card', () => {
  it('saves the image of the card, not always the first of the post', () => {
    const item = {
      imageIndex: 2,
      thumbnailUrl: 'https://cdn/thumb3.jpg',
    } as VisionboardItem
    expect(saveTargetFields(item)).toEqual({
      imageIndex: 2,
      thumbUrl: 'https://cdn/thumb3.jpg',
    })
  })
})
