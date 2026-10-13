/**
 * Launch Hub: adapts one launch text to each network's rules (limit, how the
 * network counts characters, hashtags, links), adding a link back to the post
 * on the Aqua. Pure functions, tested in __tests__/lib/launch-hub-assist.test.ts.
 */

export type Counting = 'x' | 'codepoints'

export type TextRules = {
  /** characters allowed in the post (or title, for Reddit) */
  maxLength: number
  counting: Counting
  /**
   * The share URL carries the link in its own parameter (X `url`, Threads
   * `url`…). Otherwise the link is written into the text.
   */
  linkParam: boolean
  /** The link sent in its own parameter still counts toward the limit (X does). */
  linkCountsInLimit: boolean
  /** Append the launch tags as #hashtags. */
  hashtags: boolean
  maxHashtags?: number
  /** Links can't be clicked here (Instagram captions): keep them out of the text. */
  noLinksInText?: boolean
}

export type AdaptInput = {
  text: string
  title?: string
  link?: string
  /** Public URL of the same post on the Aqua (link back). */
  aquaUrl?: string
  tags?: string[]
}

export type AdaptedPost = {
  /** Text to prefill/copy. */
  text: string
  /** Link sent separately (only when `linkParam`). */
  url?: string
  title?: string
  hashtags: string[]
  droppedHashtags: string[]
  /** Length the way the network counts it, including a separate link if it counts. */
  length: number
  limit: number
  truncated: boolean
}

/** X counts every link as 23 characters (t.co), whatever its real length. */
export const X_URL_LENGTH = 23
const URL_RE = /https?:\/\/[^\s]+/giu

/**
 * Approximation of twitter-text v3 weighting: Latin, punctuation and common
 * symbols count 1; everything else (CJK, most emoji…) counts 2; an emoji
 * sequence (ZWJ, skin tone, flag pair) counts 2 in total; links count 23.
 */
function xWeight(text: string): number {
  let total = 0
  const rest = text.replace(URL_RE, () => {
    total += X_URL_LENGTH
    return ''
  })
  const cps = [...rest]
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i]!.codePointAt(0)!
    if (/\p{Extended_Pictographic}/u.test(cps[i]!) || isRegionalIndicator(c)) {
      total += 2
      // swallow the rest of the emoji sequence
      if (
        isRegionalIndicator(c) &&
        isRegionalIndicator(cps[i + 1]?.codePointAt(0) ?? 0)
      )
        i++
      while (i + 1 < cps.length) {
        const n = cps[i + 1]!.codePointAt(0)!
        if (n === 0x200d) {
          i += 2 // ZWJ + next symbol
          continue
        }
        if (
          n === 0xfe0f ||
          n === 0xfe0e ||
          (n >= 0x1f3fb && n <= 0x1f3ff) ||
          n === 0x20e3
        ) {
          i++
          continue
        }
        break
      }
      continue
    }
    if (c === 0xfe0f || c === 0xfe0e) continue
    total += isLight(c) ? 1 : 2
  }
  return total
}

const isRegionalIndicator = (c: number) => c >= 0x1f1e6 && c <= 0x1f1ff
const isLight = (c: number) =>
  (c >= 0 && c <= 4351) ||
  (c >= 8192 && c <= 8205) ||
  (c >= 8208 && c <= 8223) ||
  (c >= 8242 && c <= 8247)

export function measure(text: string, counting: Counting): number {
  return counting === 'x' ? xWeight(text) : [...text].length
}

/** "#Arte Digital", "arte" → "ArteDigital", "arte" (letters, digits, _). */
export function normalizeHashtag(tag: string): string {
  return tag
    .trim()
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_]+/gu, '')
}

function uniqueTags(tags: string[] | undefined, text: string): string[] {
  const seen = new Set<string>()
  const lower = text.toLocaleLowerCase()
  const out: string[] = []
  for (const raw of tags ?? []) {
    const tag = normalizeHashtag(raw)
    const key = tag.toLocaleLowerCase()
    if (!tag || /^\d+$/.test(tag) || seen.has(key)) continue
    seen.add(key)
    // already written in the text: don't repeat
    if (new RegExp(`#${escapeRe(key)}(?![\\p{L}\\p{N}_])`, 'u').test(lower))
      continue
    out.push(tag)
  }
  return out
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Cuts `text` so that `measure(text…)` fits `budget`, preferring a word boundary. */
export function truncateTo(
  text: string,
  budget: number,
  counting: Counting,
): string {
  if (measure(text, counting) <= budget) return text
  if (budget <= 1) return ''
  const cps = [...text]
  let lo = 0
  let hi = cps.length
  // longest prefix whose measure + "…" fits
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(cps.slice(0, mid).join('').trimEnd() + '…', counting) <= budget)
      lo = mid
    else hi = mid - 1
  }
  let cut = cps.slice(0, lo).join('')
  const space = cut.search(/\s\S*$/u)
  if (space > cut.length * 0.8) cut = cut.slice(0, space)
  // never leave a broken link at the end
  cut = cut.replace(/https?:\/\/\S*$/u, '')
  return cut.trimEnd() + '…'
}

export function adaptPost(input: AdaptInput, rules: TextRules): AdaptedPost {
  const body = input.text.trim()
  const link = input.link?.trim() || undefined
  const aqua = input.aquaUrl?.trim() || undefined
  const primary = link ?? aqua
  const secondary = link && aqua && link !== aqua ? aqua : undefined

  // links that go inside the text
  const inText: string[] = []
  let url: string | undefined
  if (rules.noLinksInText) {
    // not clickable in the text: only offered as a separate field (Reddit, Pinterest)
    url = primary
  } else {
    if (primary && rules.linkParam) url = primary
    else if (primary && !body.includes(primary)) inText.push(primary)
    if (secondary && !body.includes(secondary))
      inText.push(`Também na Aqua: ${secondary}`)
  }
  const tail = inText.length ? `\n\n${inText.join('\n')}` : ''
  const separate =
    url && rules.linkParam && rules.linkCountsInLimit
      ? measure(` ${url}`, rules.counting)
      : 0

  let tags = rules.hashtags ? uniqueTags(input.tags, body) : []
  if (rules.maxHashtags !== undefined) tags = tags.slice(0, rules.maxHashtags)
  const dropped: string[] = []
  const hashtagLine = () =>
    tags.length ? `\n\n${tags.map(t => `#${t}`).join(' ')}` : ''
  const total = (b: string) =>
    measure(b + tail + hashtagLine(), rules.counting) + separate

  // 1. if dropping hashtags (from the end) avoids cutting the text, drop them
  const all = tags.slice()
  while (tags.length && total(body) > rules.maxLength)
    dropped.unshift(tags.pop()!)
  let finalBody = body
  let truncated = false
  if (total(body) > rules.maxLength) {
    // the text has to be cut anyway: keep the hashtags, cut the text, keep links
    tags = all.slice()
    dropped.length = 0
    truncated = true
    const cut = () => {
      const budget = rules.maxLength - (total('') - measure('', rules.counting))
      let out = truncateTo(body, Math.max(0, budget), rules.counting)
      // the join between parts can shift the count by a character or two
      for (let b = budget - 1; total(out) > rules.maxLength && b > 0; b--)
        out = truncateTo(body, b, rules.counting)
      return out
    }
    finalBody = cut()
    // hashtags so long that no text fits: drop them after all
    while (tags.length && (total(finalBody) > rules.maxLength || !finalBody)) {
      dropped.unshift(tags.pop()!)
      finalBody = cut()
    }
    if (total(finalBody) > rules.maxLength) finalBody = ''
  }
  const text = (finalBody + tail + hashtagLine()).trim()
  return {
    text,
    ...(url ? {url} : {}),
    ...(input.title ? {title: input.title} : {}),
    hashtags: tags,
    droppedHashtags: dropped,
    length: measure(text, rules.counting) + separate,
    limit: rules.maxLength,
    truncated,
  }
}
