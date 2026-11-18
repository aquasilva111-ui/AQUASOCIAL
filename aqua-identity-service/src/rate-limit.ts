export function createLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return function allow(key: string, now: number) {
    const fresh = (hits.get(key) ?? []).filter(stamp => now - stamp < windowMs)
    if (fresh.length >= limit) {
      hits.set(key, fresh)
      return false
    }
    fresh.push(now)
    hits.set(key, fresh)
    return true
  }
}
