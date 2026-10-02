import {type Queryable} from '../db/index.js'
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

/**
 * Fixed-window limiter backed by the database, so every API instance shares
 * one count. A burst at a window edge can reach up to 2x the limit; that is
 * fine for abuse control.
 */
export class SharedRateLimiter {
  constructor(
    private readonly db: Queryable,
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  async take(key: string, now = Date.now()) {
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs
    const [row] = await this.db.query<{hits: number}>(
      `insert into adult_rate_limits (key, window_start, hits) values ($1, $2, 1)
       on conflict (key, window_start) do update set hits = adult_rate_limits.hits + 1
       returning hits`,
      [key, windowStart],
    )
    // Old windows are useless; sweep them now and then, not on every hit.
    if (Math.random() < 0.01)
      await this.db.query(
        `delete from adult_rate_limits where window_start < $1`,
        [now - 24 * 3600_000],
      )
    return row.hits <= this.limit
  }
}

export async function enforce(
  limiter: RateLimiter | SharedRateLimiter,
  key: string,
) {
  if (!(await limiter.take(key))) throw new ApiError(429, 'rate_limited')
}
