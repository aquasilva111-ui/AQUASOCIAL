/* eslint-disable no-bitwise -- colour channel packing and bucketing */
/**
 * Visual "aesthetic" of an image, computed from its pixels with no external
 * model. It captures colour mood (palette, lightness, chroma, warmth,
 * contrast), not subject matter: it can tell a soft pastel image from a dark
 * moody one, but not a cat from a car. Everything here is pure so it can be
 * tested and tuned without a renderer.
 */

/** Compact, serialisable signature. All numbers are integers so it stays small in a PDS record. */
export type Aesthetic = {
  /** Up to 5 dominant colours as #rrggbb, most prominent first. */
  palette: string[]
  /** Mean perceptual lightness, 0 (black) to 100 (white). */
  light: number
  /** Mean colourfulness, 0 (grey) to 100 (vivid). */
  chroma: number
  /** -100 cold (blue) to 100 warm (orange/red/yellow). */
  warmth: number
  /** Spread of lightness, 0 (flat) to 100 (stark). */
  contrast: number
}

export const PALETTE_SIZE = 5
const SAMPLE_PIXELS = 4096
const MIN_COLOR_SHARE = 0.02
const PALETTE_MERGE_DISTANCE = 0.07
const WARM_HUE = (55 * Math.PI) / 180
const WARMTH_SCALE = 0.15
const CHROMA_MAX = 0.3

type Lab = {L: number; a: number; b: number}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** sRGB (0-255) to OKLab, a perceptually even colour space. */
export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function hexToRgb(hex: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return undefined
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function hexToLab(hex: string): Lab {
  const rgb = hexToRgb(hex) ?? [128, 128, 128]
  return rgbToOklab(rgb[0], rgb[1], rgb[2])
}

function labDistance(x: Lab, y: Lab): number {
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b)
}

export type PixelSource = {
  /** RGBA bytes, row-major, like canvas ImageData.data. */
  data: ArrayLike<number>
  width: number
  height: number
}

/**
 * Signature from raw pixels. Samples with a fixed stride, ignores
 * (near-)transparent pixels, and is deterministic for the same input.
 */
export function aestheticFromPixels(src: PixelSource): Aesthetic | undefined {
  const total = Math.floor(src.data.length / 4)
  if (total === 0) return undefined
  const stride = Math.max(1, Math.floor(total / SAMPLE_PIXELS))

  let n = 0
  let sumL = 0
  let sumL2 = 0
  let sumC = 0
  let sumWarm = 0
  const buckets = new Map<
    number,
    {count: number; r: number; g: number; b: number}
  >()

  for (let i = 0; i < total; i += stride) {
    const o = i * 4
    if (src.data[o + 3] < 32) continue
    const r = src.data[o]
    const g = src.data[o + 1]
    const b = src.data[o + 2]
    const lab = rgbToOklab(r, g, b)
    const c = Math.hypot(lab.a, lab.b)
    n++
    sumL += lab.L
    sumL2 += lab.L * lab.L
    sumC += c
    sumWarm += c * Math.cos(Math.atan2(lab.b, lab.a) - WARM_HUE)

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count++
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, {count: 1, r, g, b})
    }
  }
  if (n === 0) return undefined

  const meanL = sumL / n
  const variance = Math.max(0, sumL2 / n - meanL * meanL)
  return {
    palette: paletteFromBuckets([...buckets.values()], n),
    light: Math.round(clamp(meanL, 0, 1) * 100),
    chroma: Math.round(clamp(sumC / n / CHROMA_MAX, 0, 1) * 100),
    warmth: Math.round(clamp(sumWarm / n / WARMTH_SCALE, -1, 1) * 100),
    // Std dev of OKLab L tops out near 0.5 for a half black/half white image.
    contrast: Math.round(clamp(Math.sqrt(variance) / 0.5, 0, 1) * 100),
  }
}

function paletteFromBuckets(
  buckets: {count: number; r: number; g: number; b: number}[],
  total: number,
): string[] {
  const entries: {lab: Lab; count: number; r: number; g: number; b: number}[] =
    []
  for (const bk of buckets.sort((x, y) => y.count - x.count)) {
    if (bk.count / total < MIN_COLOR_SHARE && entries.length > 0) break
    const lab = rgbToOklab(bk.r / bk.count, bk.g / bk.count, bk.b / bk.count)
    const near = entries.find(
      e => labDistance(e.lab, lab) < PALETTE_MERGE_DISTANCE,
    )
    if (near) {
      near.count += bk.count
      near.r += bk.r
      near.g += bk.g
      near.b += bk.b
    } else if (entries.length < PALETTE_SIZE) {
      entries.push({lab, count: bk.count, r: bk.r, g: bk.g, b: bk.b})
    }
  }
  return entries
    .sort((x, y) => y.count - x.count)
    .map(e => rgbToHex(e.r / e.count, e.g / e.count, e.b / e.count))
}

/** Repo data is public: never trust a stored signature. Returns undefined if unusable. */
export function normalizeAesthetic(raw: unknown): Aesthetic | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const num = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.round(clamp(v, min, max))
      : undefined
  const light = num(r.light, 0, 100)
  const chroma = num(r.chroma, 0, 100)
  const warmth = num(r.warmth, -100, 100)
  const contrast = num(r.contrast, 0, 100)
  if (
    light === undefined ||
    chroma === undefined ||
    warmth === undefined ||
    contrast === undefined
  )
    return undefined
  const palette = Array.isArray(r.palette)
    ? r.palette
        .filter((c): c is string => typeof c === 'string' && !!hexToRgb(c))
        .map(c => c.toLowerCase())
        .slice(0, PALETTE_SIZE)
    : []
  return {palette, light, chroma, warmth, contrast}
}

// Dimension scales used to bring every statistic to 0-1 before comparing.
const SPAN = {light: 100, chroma: 100, warmth: 200, contrast: 100}
const STAT_WEIGHT = {light: 1, chroma: 1, warmth: 0.8, contrast: 0.6}
const STAT_WEIGHT_SUM =
  STAT_WEIGHT.light +
  STAT_WEIGHT.chroma +
  STAT_WEIGHT.warmth +
  STAT_WEIGHT.contrast

function statDistance(a: Aesthetic, b: Aesthetic): number {
  return (
    (STAT_WEIGHT.light * (Math.abs(a.light - b.light) / SPAN.light) +
      STAT_WEIGHT.chroma * (Math.abs(a.chroma - b.chroma) / SPAN.chroma) +
      STAT_WEIGHT.warmth * (Math.abs(a.warmth - b.warmth) / SPAN.warmth) +
      STAT_WEIGHT.contrast *
        (Math.abs(a.contrast - b.contrast) / SPAN.contrast)) /
    STAT_WEIGHT_SUM
  )
}

// Mean nearest-colour distance, both ways so it is symmetric.
function paletteDistance(a: string[], b: string[]): number | undefined {
  if (a.length === 0 || b.length === 0) return undefined
  const la = a.map(hexToLab)
  const lb = b.map(hexToLab)
  const oneWay = (from: Lab[], to: Lab[]) =>
    from.reduce(
      (sum, c) => sum + Math.min(...to.map(t => labDistance(c, t))),
      0,
    ) / from.length
  // ~0.6 is about the distance between black and a saturated colour.
  return clamp((oneWay(la, lb) + oneWay(lb, la)) / 2 / 0.6, 0, 1)
}

// Combined distance at which two looks count as unrelated. Raw distances
// bunch up around the middle of 0-1 (even black vs white is only ~0.6), so
// without this normalisation opposites would still look half-similar.
const UNRELATED_DISTANCE = 0.6

/** 0 (nothing alike) to 1 (same look). Falls back to statistics if a palette is missing. */
export function aestheticSimilarity(a: Aesthetic, b: Aesthetic): number {
  const stats = statDistance(a, b)
  const pal = paletteDistance(a.palette, b.palette)
  const distance = pal === undefined ? stats : 0.5 * stats + 0.5 * pal
  return 1 - clamp(distance / UNRELATED_DISTANCE, 0, 1)
}

/**
 * Named "moods". These are prototypes in statistic space, picked by hand, not
 * learned: treat them as an editable vocabulary. An image gets a label when
 * it sits close to a prototype, never a hard category.
 */
export type AestheticPreset = {
  id: string
  label: string
  light: number
  chroma: number
  warmth: number
  contrast: number
}

export const AESTHETIC_PRESETS: AestheticPreset[] = [
  {
    id: 'minimalista',
    label: 'Minimalista',
    light: 88,
    chroma: 8,
    warmth: 0,
    contrast: 22,
  },
  {id: 'noir', label: 'Noir', light: 22, chroma: 6, warmth: 0, contrast: 55},
  {
    id: 'dark-academia',
    label: 'Dark academia',
    light: 30,
    chroma: 24,
    warmth: 45,
    contrast: 40,
  },
  {
    id: 'cottagecore',
    label: 'Cottagecore',
    light: 68,
    chroma: 30,
    warmth: 35,
    contrast: 28,
  },
  {
    id: 'pastel',
    label: 'Pastel',
    light: 88,
    chroma: 20,
    warmth: 10,
    contrast: 16,
  },
  {
    id: 'vaporwave',
    label: 'Vaporwave / Y2K',
    light: 65,
    chroma: 55,
    warmth: -30,
    contrast: 45,
  },
  {id: 'neon', label: 'Neon', light: 40, chroma: 65, warmth: -10, contrast: 65},
  {
    id: 'terroso',
    label: 'Terroso / Boho',
    light: 55,
    chroma: 30,
    warmth: 70,
    contrast: 30,
  },
  {
    id: 'oceano',
    label: 'Oceano / Frio',
    light: 55,
    chroma: 28,
    warmth: -60,
    contrast: 30,
  },
  {
    id: 'vivido',
    label: 'Vívido / Pop',
    light: 60,
    chroma: 70,
    warmth: 20,
    contrast: 50,
  },
]

export type AestheticMatch = {id: string; label: string; score: number}

const PRESET_SIGMA = 0.18

/** Presets ranked by closeness, best first. Scores are 0-1 and not a probability. */
export function matchPresets(
  a: Aesthetic,
  presets: AestheticPreset[] = AESTHETIC_PRESETS,
): AestheticMatch[] {
  return presets
    .map(p => {
      const d = statDistance(a, {...p, palette: []})
      return {
        id: p.id,
        label: p.label,
        score: Math.exp(-(d * d) / (2 * PRESET_SIGMA * PRESET_SIGMA)),
      }
    })
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1))
}

/** The best preset, or undefined when the image fits none of them well. */
export function labelOf(
  a: Aesthetic,
  minScore = 0.35,
): AestheticMatch | undefined {
  const best = matchPresets(a)[0]
  return best && best.score >= minScore ? best : undefined
}
