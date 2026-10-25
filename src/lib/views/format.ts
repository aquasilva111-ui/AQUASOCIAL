/**
 * pt-BR labels for Aqua Views. Missing metrics stay hidden: this app does not
 * have a global view counter yet, so a missing or zero count is not shown as
 * "0 visualizações".
 */

const compact = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1})

export function formatCompactPt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) {
    const unit = abs < 2_000_000_000 ? 'bilhão' : 'bilhões'
    return `${compact.format(n / 1_000_000_000)} ${unit}`
  }
  if (abs >= 1_000_000) {
    const unit = abs < 2_000_000 ? 'milhão' : 'milhões'
    return `${compact.format(n / 1_000_000)} ${unit}`
  }
  if (abs >= 1_000) return `${compact.format(n / 1_000)} mil`
  return compact.format(n)
}

/** A positive finite count, or undefined when the metric is absent. */
export function knownCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return undefined
  return Math.floor(value)
}

/**
 * Global view counts are not on the post yet. Only a real positive `viewCount`
 * is formatted; the per-device placeholder in `lib/media/views` is not a
 * public number and must not be displayed.
 */
export function knownViewCount(post: object): number | undefined {
  return knownCount((post as {viewCount?: unknown}).viewCount)
}

/** Seconds, when the embed actually carries a duration. Never invented. */
export function knownDurationSeconds(source: object | null | undefined) {
  if (!source) return undefined
  const raw =
    (source as {duration?: unknown; durationSeconds?: unknown}).duration ??
    (source as {durationSeconds?: unknown}).durationSeconds
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0)
    return undefined
  // Guard a millisecond value if one ever shows up on the embed.
  const seconds = raw > 24 * 60 * 60 ? raw / 1000 : raw
  if (seconds <= 0 || seconds > 24 * 60 * 60) return undefined
  return seconds
}

export function formatViewLabel(count: number | null | undefined) {
  const n = knownCount(count)
  if (n === undefined) return undefined
  return `${formatCompactPt(n)} ${n === 1 ? 'visualização' : 'visualizações'}`
}

/** `0` is a real follower total once the profile has loaded; `null` is not. */
export function formatSubscriberLabel(count: number | null | undefined) {
  if (count == null || !Number.isFinite(count) || count < 0) return undefined
  const n = Math.floor(count)
  return `${formatCompactPt(n)} ${n === 1 ? 'inscrito' : 'inscritos'}`
}

export function formatWatchingLabel(count: number | null | undefined) {
  const n = knownCount(count)
  if (n === undefined) return undefined
  return n === 1
    ? '1 pessoa assistindo'
    : `${formatCompactPt(n)} pessoas assistindo`
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0)
    return undefined
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (v: number) => String(v).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

const RELATIVE_STEPS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.34524, 'week'],
  [12, 'month'],
  [Number.POSITIVE_INFINITY, 'year'],
]

export function formatRelativePt(
  iso: string | number | Date | null | undefined,
  now = Date.now(),
) {
  if (iso == null || iso === '') return undefined
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return undefined
  const rtf = new Intl.RelativeTimeFormat('pt-BR', {numeric: 'always'})
  let duration = Math.round((then - now) / 1000)
  for (const [amount, unit] of RELATIVE_STEPS) {
    if (Math.abs(duration) < amount)
      return rtf.format(Math.round(duration), unit)
    duration /= amount
  }
  return undefined
}
