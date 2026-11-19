import {type LimitWindow} from './types'

export type RateLimitResult =
  | {ok: true; remaining: number}
  | {ok: false; reason: 'rate-limited'; retryAt: number}

export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>()

  constructor(
    private readonly limits: Record<string, LimitWindow>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  consume(bucket: string, id: string): RateLimitResult {
    const rule = this.limits[bucket]
    if (!rule) return {ok: true, remaining: Number.POSITIVE_INFINITY}
    const key = `${bucket}:${id.trim().toLowerCase()}`
    const now = this.now()
    const fresh = (this.hits.get(key) ?? []).filter(
      stamp => now - stamp < rule.windowMs,
    )
    if (fresh.length >= rule.limit) {
      const retryAt = fresh[0] + rule.windowMs
      this.hits.set(key, fresh)
      return {ok: false, reason: 'rate-limited', retryAt}
    }
    fresh.push(now)
    this.hits.set(key, fresh)
    return {ok: true, remaining: rule.limit - fresh.length}
  }
}
