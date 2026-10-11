/**
 * "Pra você" (aqua-feeds/): helpers to read the explanation that every item of
 * this feed carries in `feedContext`, and the shapes of place.aqua.* responses.
 * Pure functions only (tested in __tests__/lib/aqua-for-you.test.ts).
 */
import {AQUA_FOR_YOU_FEED_URI} from '#/env'

export type Via =
  | 'tag'
  | 'texto'
  | 'idioma'
  | 'rotulo'
  | 'criador'
  | 'formato'
  | 'sinapse'

export interface ContextPart {
  key: string
  tipo: string
  nome: string
  via: Via
  points: number
  through?: string
}

export interface ForYouContext {
  score: number
  freshness: number
  hot: number
  parts: ContextPart[]
  penalties: Array<'visto' | 'mostrar-menos' | 'silenciada'>
}

const VIAS = new Set<Via>([
  'tag',
  'texto',
  'idioma',
  'rotulo',
  'criador',
  'formato',
  'sinapse',
])

export function splitConventionKey(key: string): {tipo: string; nome: string} {
  const i = key.indexOf(':')
  if (i <= 0) return {tipo: '', nome: key}
  return {tipo: key.slice(0, i), nome: key.slice(i + 1)}
}

/** `feedContext` → parts, or undefined when it is not a "Pra você" context. */
export function parseForYouContext(
  raw: string | undefined,
): ForYouContext | undefined {
  if (!raw || raw.length > 2000) return undefined
  let o: unknown
  try {
    o = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!o || typeof o !== 'object') return undefined
  const c = o as Record<string, unknown>
  if (c.a !== 'pra-voce' || c.v !== 1) return undefined
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0)
  const parts: ContextPart[] = []
  for (const item of Array.isArray(c.c) ? c.c : []) {
    if (!Array.isArray(item)) continue
    const [key, via, points, through] = item
    if (typeof key !== 'string' || !VIAS.has(via)) continue
    parts.push({
      key,
      ...splitConventionKey(key),
      via,
      points: num(points),
      ...(typeof through === 'string' ? {through} : {}),
    })
  }
  return {
    score: num(c.s),
    freshness: num(c.f),
    hot: num(c.h),
    parts,
    penalties: (Array.isArray(c.p) ? c.p : []).filter(
      (p): p is ForYouContext['penalties'][number] =>
        p === 'visto' || p === 'mostrar-menos' || p === 'silenciada',
    ),
  }
}

export function isForYouFeed(
  feedDescriptor: string | undefined,
  feedUri: string = AQUA_FOR_YOU_FEED_URI,
): boolean {
  return Boolean(feedUri) && feedDescriptor === `feedgen|${feedUri}`
}

/** Share of the score per part (0–1), for the bars in the sheet. */
export function shares(ctx: ForYouContext): Array<ContextPart & {share: number}> {
  const total = ctx.score > 0 ? ctx.score : 1
  return ctx.parts.map(p => ({...p, share: Math.max(0, Math.min(1, p.points / total))}))
}

/** Last `n` values scaled 0–1 for a tiny bar chart (empty → []). */
export function sparkline(values: number[], n = 12): number[] {
  const v = values.slice(-n)
  const max = Math.max(0, ...v)
  return max > 0 ? v.map(x => Math.max(0, x) / max) : v.map(() => 0)
}

/** Direction of the trend: compares the last point with the one before. */
export function trendDirection(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat'
  const a = values[values.length - 2]!
  const b = values[values.length - 1]!
  if (b > a * 1.05) return 'up'
  if (b < a * 0.95) return 'down'
  return 'flat'
}

// ---------- place.aqua.* response shapes (aqua-feeds/src/algos/for-you/feed.ts)

export type Estado = 'emergente' | 'ativa' | 'enfraquecendo' | 'dormente'
export type AdjustAction = 'add' | 'boost' | 'mute' | 'unmute' | 'delete' | 'wrong'

export interface ConventionView {
  key: string
  id: string
  tipo: string
  nome: string
  gravidade: number
  gravidadeInferida: number
  estado: Estado
  fonte: 'usuario' | 'aqua'
  status: 'confirmado' | 'hipótese'
  certeza: 'explicito' | 'inferido'
  boost: number
  silenciada: boolean
  sinais: Partial<Record<string, number>>
  ultimoSinal?: string
  tendencia: Array<{at: string; gravidade: number}>
}

export interface ConventionProfileView {
  did: string
  geradoEm: string
  ultimaMudanca?: string
  convencoes: ConventionView[]
  sinapses: Array<{a: string; b: string; vezes: number}>
  bloqueadas: string[]
  /** off by default: the Aqua does not infer conventions in these categories */
  categoriasSensiveis?: SensitiveCategoryView[]
}

export interface SensitiveCategoryView {
  id: string
  nome: string
  descricao: string
  ativa: boolean
  exemplos: string[]
}

export interface HistoryEntryView {
  hash: string
  at: string
  reason: string
  fonte: string
  status: string
  certeza: 'explicito' | 'verificado' | 'inferido'
  changes: Array<{
    key: string
    kind: 'added' | 'modified' | 'removed'
    fields: Array<{field: string; before?: unknown; after?: unknown}>
  }>
}

export interface ExplainView {
  uri: string
  personalizado: boolean
  motivos: string[]
  convencoesDoPost: string[]
  formula: string
  explicacao: {score: number}
}

/** Normalizes what the user types in "Add a convention". */
export function normalizeConventionName(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-')
}
