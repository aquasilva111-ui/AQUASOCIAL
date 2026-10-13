/**
 * Social-feed guard for adult content.
 *
 * Sensitive content stays out of the normal Aqua feed unless the viewer has
 * opted in (`adultContentEnabled`, off by default — the same idea as X) AND
 * they have turned off "Ocultar do Aqua principal" (on by default). The +18
 * portal itself never writes into this feed; this is the backstop for posts
 * that carry an adult label or an explicit adult flag.
 */

export const ADULT_CONTENT_LABELS = [
  'porn',
  'sexual',
  'nudity',
  'graphic-media',
  'aqua-adult',
] as const

const ADULT_LABEL_SET = new Set<string>(ADULT_CONTENT_LABELS)

const HIDE_FROM_MAIN_KEY = 'aqua.adultHideFromMain'

let hideFromMainMemory: boolean | undefined

export type AdultFeedCandidate = {
  labels?: {val?: string}[] | null
  record?: unknown
}

function labelValues(post: AdultFeedCandidate): string[] {
  const out: string[] = []
  for (const label of post.labels ?? []) {
    if (label?.val) out.push(label.val)
  }
  const record = post.record
  if (!record || typeof record !== 'object') return out
  const self = (record as {labels?: {values?: {val?: string}[]}}).labels
  for (const value of self?.values ?? []) {
    if (value?.val) out.push(value.val)
  }
  return out
}

export function isAdultFeedCandidate(post: AdultFeedCandidate): boolean {
  if (labelValues(post).some(value => ADULT_LABEL_SET.has(value))) return true
  const record = post.record
  if (!record || typeof record !== 'object') return false
  const flagged = record as {adult?: unknown; aquaAdult?: unknown}
  return flagged.adult === true || flagged.aquaAdult === true
}

/**
 * True when this post may be rendered in a social feed, search result, or
 * explore preview. Fail closed: missing opt-in, or the hide-from-main
 * preference, drops every adult candidate.
 */
export function postMayEnterSocialFeed(
  post: AdultFeedCandidate,
  opts: {adultContentEnabled: boolean; hideFromMain: boolean},
): boolean {
  if (!isAdultFeedCandidate(post)) return true
  if (!opts.adultContentEnabled) return false
  if (opts.hideFromMain) return false
  return true
}

/** Default on: nothing from +18 is mixed into the common feed. */
export function readHideAdultFromMain(): boolean {
  if (hideFromMainMemory !== undefined) return hideFromMainMemory
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(HIDE_FROM_MAIN_KEY)
      if (stored === '0') return false
      if (stored === '1') return true
    }
  } catch {
    // Private mode and native runtimes have no localStorage. Stay hidden.
  }
  return true
}

export function writeHideAdultFromMain(hide: boolean): void {
  hideFromMainMemory = hide
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HIDE_FROM_MAIN_KEY, hide ? '1' : '0')
    }
  } catch {
    // The in-memory value still applies for this session.
  }
}
