import {
  type Aesthetic,
  type AestheticMatch,
  aestheticSimilarity,
  hexToRgb,
  labelOf,
  matchPresets,
  PALETTE_SIZE,
  rgbToHex,
  rgbToOklab,
} from '#/lib/visionboard/aesthetics'

/**
 * Pinterest-style logic over aesthetics and folders. Pure and deterministic:
 * the same pins always give the same profile, suggestions and groups.
 *
 * A folder is described by a BoardProfile (its look, its tags, its creators,
 * and how coherent it is). Candidates are scored against that profile, so
 * "what fits this folder" and "what fits me" are the same computation, run
 * over a folder or over everything the viewer has saved.
 */

export type Pinnable = {
  /** Stable identity, e.g. `${postUri}#${imageIndex}`. */
  id: string
  author: string
  tags: string[]
  aesthetic?: Aesthetic
}

export type BoardProfile = {
  size: number
  /** Mean look of the folder. Absent when no pin has a signature yet. */
  aesthetic?: Aesthetic
  /** 0 (a grab bag) to 1 (one clear look). Needs at least 2 signed pins. */
  cohesion: number
  /** Share of pins carrying each tag, 0-1. */
  tags: Map<string, number>
  /** Share of pins by each creator, 0-1. */
  authors: Map<string, number>
  /** Closest named moods of the mean look, best first (max 2). */
  moods: AestheticMatch[]
}

export const WEIGHTS = {
  aesthetic: 0.6,
  tags: 0.3,
  author: 0.1,
  /** A grab-bag folder trusts the look this much less (at cohesion 0). */
  aestheticFloor: 0.4,
  /** Candidates below this never show up as suggestions. */
  minScore: 0.25,
  /** Same creator and a look this close counts as a near-duplicate. */
  duplicateSimilarity: 0.97,
  authorGap: 2,
  groupThreshold: 0.78,
  groupMinSize: 3,
  /** Share of an explore page reserved for adjacent-but-different images. */
  exploreShare: 0.2,
  /** Explore picks must sit in this score band: related, not identical. */
  exploreBand: [0.25, 0.55] as [number, number],
}

const PALETTE_MERGE = 0.07

/** Colours from many palettes merged into one, most common first. */
function mergePalettes(palettes: string[][]): string[] {
  const entries: {
    lab: ReturnType<typeof rgbToOklab>
    count: number
    r: number
    g: number
    b: number
  }[] = []
  for (const palette of palettes) {
    palette.forEach((hex, rank) => {
      const rgb = hexToRgb(hex)
      if (!rgb) return
      const weight = PALETTE_SIZE - rank // earlier colours count more
      const lab = rgbToOklab(rgb[0], rgb[1], rgb[2])
      const near = entries.find(
        e =>
          Math.hypot(e.lab.L - lab.L, e.lab.a - lab.a, e.lab.b - lab.b) <
          PALETTE_MERGE,
      )
      if (near) {
        near.count += weight
        near.r += rgb[0] * weight
        near.g += rgb[1] * weight
        near.b += rgb[2] * weight
      } else {
        entries.push({
          lab,
          count: weight,
          r: rgb[0] * weight,
          g: rgb[1] * weight,
          b: rgb[2] * weight,
        })
      }
    })
  }
  return entries
    .sort((x, y) => y.count - x.count)
    .slice(0, PALETTE_SIZE)
    .map(e => rgbToHex(e.r / e.count, e.g / e.count, e.b / e.count))
}

function meanAesthetic(signed: Aesthetic[]): Aesthetic | undefined {
  if (signed.length === 0) return undefined
  const mean = (pick: (a: Aesthetic) => number) =>
    Math.round(signed.reduce((s, a) => s + pick(a), 0) / signed.length)
  return {
    palette: mergePalettes(signed.map(a => a.palette)),
    light: mean(a => a.light),
    chroma: mean(a => a.chroma),
    warmth: mean(a => a.warmth),
    contrast: mean(a => a.contrast),
  }
}

export function profileOf(pins: Pinnable[]): BoardProfile {
  const signed = pins.flatMap(p => (p.aesthetic ? [p.aesthetic] : []))
  const aesthetic = meanAesthetic(signed)

  let cohesion = 0
  if (aesthetic && signed.length >= 2) {
    cohesion =
      signed.reduce((s, a) => s + aestheticSimilarity(a, aesthetic), 0) /
      signed.length
  }

  const tags = new Map<string, number>()
  const authors = new Map<string, number>()
  for (const p of pins) {
    for (const t of new Set(p.tags)) tags.set(t, (tags.get(t) ?? 0) + 1)
    authors.set(p.author, (authors.get(p.author) ?? 0) + 1)
  }
  const share = (m: Map<string, number>) => {
    for (const [k, v] of m) m.set(k, v / Math.max(1, pins.length))
  }
  share(tags)
  share(authors)

  return {
    size: pins.length,
    aesthetic,
    cohesion,
    tags,
    authors,
    moods: aesthetic ? matchPresets(aesthetic).slice(0, 2) : [],
  }
}

/** 0-1: how well one candidate fits a profile. Missing signals are skipped, not penalised. */
export function scoreForProfile(profile: BoardProfile, c: Pinnable): number {
  if (profile.size === 0) return 0

  const tagFit = Math.min(
    1,
    c.tags.reduce((s, t) => s + (profile.tags.get(t) ?? 0), 0),
  )
  const authorFit = Math.min(1, (profile.authors.get(c.author) ?? 0) * 2)

  const parts: {w: number; v: number}[] = [
    {w: WEIGHTS.tags, v: tagFit},
    {w: WEIGHTS.author, v: authorFit},
  ]
  if (c.aesthetic && profile.aesthetic) {
    // A folder with no single look can't vouch for a visual match.
    const trust =
      WEIGHTS.aestheticFloor + (1 - WEIGHTS.aestheticFloor) * profile.cohesion
    parts.push({
      w: WEIGHTS.aesthetic * trust,
      v: aestheticSimilarity(c.aesthetic, profile.aesthetic),
    })
  }
  const total = parts.reduce((s, p) => s + p.w, 0)
  return parts.reduce((s, p) => s + p.w * p.v, 0) / total
}

/** Keeps score order but stops one creator from filling a run. */
function spreadAuthors<T extends {item: Pinnable}>(ranked: T[]): T[] {
  const out: T[] = []
  const pending = [...ranked]
  while (pending.length > 0) {
    const recent = new Set(
      out.slice(-WEIGHTS.authorGap).map(x => x.item.author),
    )
    let idx = pending.findIndex(x => !recent.has(x.item.author))
    if (idx === -1) idx = 0
    out.push(pending.splice(idx, 1)[0])
  }
  return out
}

function isNearDuplicate(a: Pinnable, b: Pinnable): boolean {
  return (
    a.author === b.author &&
    !!a.aesthetic &&
    !!b.aesthetic &&
    aestheticSimilarity(a.aesthetic, b.aesthetic) >= WEIGHTS.duplicateSimilarity
  )
}

export type Ranked = {item: Pinnable; score: number}

/** Images that fit a folder, best first, without what is already in it. */
export function rankForBoard(
  profile: BoardProfile,
  candidates: Pinnable[],
  opts: {exclude?: Set<string>; limit?: number} = {},
): Ranked[] {
  const limit = opts.limit ?? 30
  const scored = candidates
    .filter(c => !opts.exclude?.has(c.id))
    .map(item => ({item, score: scoreForProfile(profile, item)}))
    .filter(x => x.score >= WEIGHTS.minScore)
    .sort((a, b) => b.score - a.score || (a.item.id < b.item.id ? -1 : 1))

  const kept: Ranked[] = []
  for (const x of scored) {
    if (kept.some(k => isNearDuplicate(k.item, x.item))) continue
    kept.push(x)
  }
  return spreadAuthors(kept).slice(0, limit)
}

export type BoardSuggestion = {boardId: string; score: number}

/** "Save to…": folders where this image fits best, best first. */
export function suggestBoards(
  item: Pinnable,
  boards: {id: string; profile: BoardProfile}[],
  opts: {threshold?: number; limit?: number} = {},
): BoardSuggestion[] {
  const threshold = opts.threshold ?? 0.5
  return boards
    .map(b => ({boardId: b.id, score: scoreForProfile(b.profile, item)}))
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score || (a.boardId < b.boardId ? -1 : 1))
    .slice(0, opts.limit ?? 3)
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sb = new Set(b)
  const inter = a.filter(t => sb.has(t)).length
  return inter / (new Set([...a, ...b]).size || 1)
}

function pairSimilarity(a: Pinnable, b: Pinnable): number {
  const tags = jaccard(a.tags, b.tags)
  if (a.aesthetic && b.aesthetic)
    return 0.7 * aestheticSimilarity(a.aesthetic, b.aesthetic) + 0.3 * tags
  return tags
}

export type SuggestedGroup = {
  name: string
  ids: string[]
  profile: BoardProfile
}

/** A readable name from what the group has in common: mood and main tag. */
export function suggestName(profile: BoardProfile): string {
  const mood = profile.aesthetic ? labelOf(profile.aesthetic)?.label : undefined
  const topTag = [...profile.tags.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
  )[0]
  const tag =
    topTag && topTag[1] >= 0.5
      ? topTag[0].charAt(0).toUpperCase() + topTag[0].slice(1)
      : undefined
  if (mood && tag) return `${mood} · ${tag}`
  return mood ?? tag ?? 'Nova pasta'
}

/**
 * Proposes folders for loose saved images: leader clustering on look + tags.
 * Groups under `groupMinSize` are dropped (left loose) so suggestions are
 * never a folder of one. Nothing is created: the caller shows these as ideas.
 */
export function groupPins(
  items: Pinnable[],
  opts: {threshold?: number; minSize?: number} = {},
): SuggestedGroup[] {
  const threshold = opts.threshold ?? WEIGHTS.groupThreshold
  const minSize = opts.minSize ?? WEIGHTS.groupMinSize
  const clusters: Pinnable[][] = []

  for (const item of items) {
    let best = -1
    let bestSim = threshold
    clusters.forEach((cluster, i) => {
      // Average link: robust to one odd member in the cluster.
      const sim =
        cluster.reduce((s, m) => s + pairSimilarity(item, m), 0) /
        cluster.length
      if (sim >= bestSim) {
        bestSim = sim
        best = i
      }
    })
    if (best === -1) clusters.push([item])
    else clusters[best].push(item)
  }

  return clusters
    .filter(c => c.length >= minSize)
    .map(c => {
      const profile = profileOf(c)
      return {name: suggestName(profile), ids: c.map(i => i.id), profile}
    })
    .sort((a, b) => b.ids.length - a.ids.length || (a.name < b.name ? -1 : 1))
}

/**
 * Explore feed from everything the viewer saved: mostly what fits, plus a
 * reserved share of related-but-different images so the feed does not
 * collapse into one look. Deterministic interleave, no randomness.
 */
export function rankExplore(
  viewer: BoardProfile,
  candidates: Pinnable[],
  opts: {limit?: number; exclude?: Set<string>; exploreShare?: number} = {},
): Pinnable[] {
  const limit = opts.limit ?? 40
  const share = opts.exploreShare ?? WEIGHTS.exploreShare
  const [lo, hi] = WEIGHTS.exploreBand

  const scored = candidates
    .filter(c => !opts.exclude?.has(c.id))
    .map(item => ({item, score: scoreForProfile(viewer, item)}))
    .sort((a, b) => b.score - a.score || (a.item.id < b.item.id ? -1 : 1))

  // Nothing known about the viewer yet: no personalisation to apply.
  if (viewer.size === 0) return scored.map(x => x.item).slice(0, limit)

  const main = spreadAuthors(scored.filter(x => x.score >= hi))
  const explore = spreadAuthors(
    scored.filter(x => x.score >= lo && x.score < hi),
  )
  const every = share > 0 ? Math.max(2, Math.round(1 / share)) : Infinity

  const out: Pinnable[] = []
  let m = 0
  let e = 0
  while (out.length < limit && (m < main.length || e < explore.length)) {
    const slot = out.length + 1
    const wantExplore = slot % every === 0
    if (wantExplore && e < explore.length) out.push(explore[e++].item)
    else if (m < main.length) out.push(main[m++].item)
    else if (e < explore.length) out.push(explore[e++].item)
  }
  return out
}

/**
 * Convention keys (see feed-generator/src/conventions) for an image's look,
 * so aesthetics become one more kind of Convention: `estetica:<mood>`.
 * Only confident matches are emitted.
 */
export function aestheticConventionKeys(
  a: Aesthetic,
  minScore = 0.5,
): string[] {
  return matchPresets(a)
    .slice(0, 2)
    .filter(m => m.score >= minScore)
    .map(m => `estetica:${m.id}`)
}
