import {ApiError} from './errors.js'

/**
 * Sliding-window limiter, in memory (one API instance). Limits are generous
 * on purpose: they stop floods and scripted abuse, not normal use. A shared
 * store (e.g. Redis) replaces this when the API runs on several instances.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>()

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Records a hit; false when `key` is over the limit. */
  take(key: string, now = Date.now()) {
    const since = now - this.windowMs
    const list = (this.hits.get(key) ?? []).filter(t => t > since)
    if (list.length >= this.limit) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    if (this.hits.size > 50_000) this.prune(since)
    return true
  }

  private prune(since: number) {
    for (const [k, v] of this.hits)
      if (!v.some(t => t > since)) this.hits.delete(k)
  }
}

export function enforce(limiter: RateLimiter, key: string) {
  if (!limiter.take(key)) throw new ApiError(429, 'rate_limited')
}
