/**
 * Masonry helpers shared by the Visionboard grids. Pure functions, no React,
 * so the layout math can be tested.
 */

/** Columns of a board grid for a given window width (2 on phones, up to 5). */
export function gridColumnCount(width: number): number {
  if (width >= 1200) return 5
  if (width >= 900) return 4
  if (width >= 600) return 3
  return 2
}

function shortest(heights: number[]): number {
  let target = 0
  for (let c = 1; c < heights.length; c++) {
    if (heights[c] < heights[target]) target = c
  }
  return target
}

/** Deals items into the shortest column, using `weight` as the item height. */
export function dealIntoColumns<T>(
  items: T[],
  columns: number,
  weight: (item: T) => number,
): T[][] {
  const cols: T[][] = Array.from({length: columns}, () => [])
  const heights = Array.from({length: columns}, () => 0)
  for (const item of items) {
    const target = shortest(heights)
    cols[target].push(item)
    heights[target] += weight(item)
  }
  return cols
}

export type MasonryBlock<T> = {columns: T[][]; spread: number}

/**
 * Splits a long list into windowed blocks of columns. Every block is a row of
 * the outer list, so it ends at the height of its tallest column and the
 * shorter columns leave a gap. To keep those gaps small, a block does not end
 * at a fixed count: between `perBlock` and `perBlock + maxExtra` items it ends
 * where its columns are the most even (the first count within `tolerance`,
 * else the most even one seen).
 *
 * `spread` is the gap the block leaves, in the same unit as `weight`.
 */
export function dealIntoBlocks<T>(
  items: T[],
  columns: number,
  weight: (item: T) => number,
  {
    perBlock = columns * 6,
    tolerance = 0.25,
    maxExtra = columns * 3,
  }: {perBlock?: number; tolerance?: number; maxExtra?: number} = {},
): MasonryBlock<T>[] {
  const blocks: MasonryBlock<T>[] = []
  let start = 0
  while (start < items.length) {
    const heights = Array.from({length: columns}, () => 0)
    const limit = Math.min(items.length - start, perBlock + maxExtra)
    let bestCount = limit
    let bestSpread = Infinity
    for (let n = 1; n <= limit; n++) {
      heights[shortest(heights)] += weight(items[start + n - 1])
      if (n < perBlock && n < limit) continue
      const spread = Math.max(...heights) - Math.min(...heights)
      if (spread < bestSpread) {
        bestSpread = spread
        bestCount = n
      }
      if (spread <= tolerance) break
    }
    // The last block takes whatever is left: more items will extend it later.
    if (start + limit === items.length && limit < perBlock + maxExtra) {
      bestCount = limit
    }
    const slice = items.slice(start, start + bestCount)
    const cols = dealIntoColumns(slice, columns, weight)
    const totals = cols.map(c => c.reduce((sum, i) => sum + weight(i), 0))
    blocks.push({
      columns: cols,
      spread: Math.max(...totals) - Math.min(...totals),
    })
    start += bestCount
  }
  return blocks
}
