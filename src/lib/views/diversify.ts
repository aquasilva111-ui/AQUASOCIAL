/**
 * Keep "A seguir" from stacking the same channel. At most `maxPerAuthor`
 * items, and never the same author twice in a row.
 */
export function diversifyChannels<T>(
  items: T[],
  authorOf: (item: T) => string,
  maxPerAuthor = 2,
): T[] {
  const counts = new Map<string, number>()
  const placed: T[] = []
  const deferred: T[] = []

  for (const item of items) {
    const author = authorOf(item)
    const count = counts.get(author) ?? 0
    if (count >= maxPerAuthor) continue
    const prev = placed[placed.length - 1]
    if (prev && authorOf(prev) === author) {
      deferred.push(item)
      continue
    }
    placed.push(item)
    counts.set(author, count + 1)
  }

  for (const item of deferred) {
    const author = authorOf(item)
    const count = counts.get(author) ?? 0
    if (count >= maxPerAuthor) continue
    const last = placed[placed.length - 1]
    if (!last || authorOf(last) !== author) {
      placed.push(item)
      counts.set(author, count + 1)
      continue
    }
    const slot = placed.findIndex((entry, index) => {
      const before = index > 0 ? authorOf(placed[index - 1]) : undefined
      return before !== author && authorOf(entry) !== author
    })
    if (slot === -1) continue
    placed.splice(slot, 0, item)
    counts.set(author, count + 1)
  }

  return placed
}
