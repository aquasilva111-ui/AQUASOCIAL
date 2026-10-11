// "Pra você": ranking por Convenções de Realidade, explicável item a item.
//
//   pontos = (base + Σ contribuições das Convenções + sinal social/quente)
//            × frescor × penalidades
//
//   • Convenção casada: a gravidade dela para o usuário. Casa por hashtag/tag,
//     idioma, rótulo, ou palavra do texto igual ao nome de uma Convenção "tema:".
//   • Sinapse: Convenção do usuário ligada a uma que o post tem → 25% do peso.
//   • Criador e formato: afinidade do usuário (log), também são Convenções.
//   • Quente: log(1 + curtidas + 2·reposts + 3·respostas).
//   • Frescor: cai pela metade a cada 12 h.
//   • Penalidades: já visto ×0,5; "mostrar menos" ×0,3; Convenção silenciada ×0,1.
// Tudo isso vai junto com o item (explicação) — nada é escondido.
import type {MediaType} from '../../conventions/extract.ts'
import type {ConventionKey} from '../../conventions/model.ts'
import {
  EMPTY_PROFILE,
  type ViewerProfile,
} from '../../conventions/profile.ts'

export {EMPTY_PROFILE, type ViewerProfile}

export interface Candidate {
  uri: string
  author: string
  indexedAt: string
  mediaType: MediaType
  likeCount: number
  repostCount: number
  replyCount: number
  conventionKeys?: ConventionKey[]
  /** texto normalizado (extract.normalizeText) para casar palavras */
  text?: string
}

export const FOR_YOU = {
  base: 0.1,
  freshnessHalfLifeHours: 12,
  hotWeight: 0.6,
  authorWeight: 0.9,
  mediaWeight: 0.5,
  synapseShare: 0.25,
  seenFactor: 0.5,
  lessFactor: 0.3,
  mutedFactor: 0.1,
} as const

export type Via = 'tag' | 'texto' | 'idioma' | 'rotulo' | 'criador' | 'formato' | 'sinapse'

export interface Contribution {
  /** a Convenção do usuário que contribuiu */
  key: ConventionKey
  via: Via
  /** peso da Convenção para o usuário (gravidade, ou afinidade) */
  weight: number
  /** quanto somou aos pontos, já com frescor e penalidades */
  points: number
  /** para sinapse: a Convenção do post que fez a ponte */
  through?: ConventionKey
}

export interface Explanation {
  uri: string
  score: number
  freshness: number
  ageHours: number
  hot: {likes: number; reposts: number; replies: number; points: number}
  base: number
  contributions: Contribution[]
  penalties: Array<{reason: 'visto' | 'mostrar-menos' | 'silenciada'; factor: number; key?: string}>
}

const viaOf = (key: string): Via =>
  key.startsWith('idioma:') ? 'idioma' : key.startsWith('rotulo:') ? 'rotulo' : 'tag'

function words(text: string | undefined): Set<string> {
  return new Set((text ?? '').split(/\s+/).filter(w => w.length >= 3))
}

export function explainCandidate(
  post: Candidate,
  profile: ViewerProfile,
  now: number,
): Explanation {
  const ageHours = Math.max(0, (now - Date.parse(post.indexedAt)) / 3_600_000)
  const freshness = Math.pow(0.5, ageHours / FOR_YOU.freshnessHalfLifeHours)
  const gravityOf = profile.conventionGravity ?? new Map()
  const muted = profile.muted ?? new Set()
  const postKeys = new Set(post.conventionKeys ?? [])
  const raw: Array<Omit<Contribution, 'points'> & {raw: number}> = []
  const penalties: Explanation['penalties'] = []

  // 1. Convenções do post que o usuário tem
  for (const key of postKeys) {
    if (muted.has(key)) {
      penalties.push({reason: 'silenciada', factor: FOR_YOU.mutedFactor, key})
      continue
    }
    const g = gravityOf.get(key)
    if (g && g > 0) raw.push({key, via: viaOf(key), weight: g, raw: g})
  }
  // 2. Palavra do texto = nome de uma Convenção "tema:" do usuário
  const ws = words(post.text)
  for (const [key, g] of gravityOf) {
    if (postKeys.has(key) || !key.startsWith('tema:') || g <= 0) continue
    const nome = key.slice(5)
    const hit = nome.includes('-')
      ? (post.text ?? '').includes(nome.replace(/-/g, ' '))
      : ws.has(nome) || ws.has(`#${nome}`)
    if (hit) {
      if (muted.has(key)) {
        penalties.push({reason: 'silenciada', factor: FOR_YOU.mutedFactor, key})
        continue
      }
      raw.push({key, via: 'texto', weight: g, raw: g})
    }
  }
  // 3. Sinapses: Convenção do usuário ligada a uma do post
  const already = new Set(raw.map(r => r.key))
  for (const [pair, count] of profile.synapses ?? []) {
    const [a, b] = pair.split('\u0000') as [string, string]
    for (const [have, other] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!postKeys.has(have) || postKeys.has(other) || already.has(other)) continue
      if (muted.has(other)) continue
      const g = gravityOf.get(other)
      if (!g || g <= 0) continue
      const strength = Math.min(1, count / 3)
      raw.push({
        key: other,
        via: 'sinapse',
        weight: g,
        through: have,
        raw: g * FOR_YOU.synapseShare * strength,
      })
      already.add(other)
    }
  }
  // 4. Criador e formato
  const aff = profile.authorAffinity.get(post.author)
  if (aff && aff > 0 && !muted.has(`criador:${post.author}`))
    raw.push({
      key: `criador:${post.author}`,
      via: 'criador',
      weight: aff,
      raw: FOR_YOU.authorWeight * Math.log1p(aff),
    })
  if (muted.has(`criador:${post.author}`))
    penalties.push({
      reason: 'silenciada',
      factor: FOR_YOU.mutedFactor,
      key: `criador:${post.author}`,
    })
  const med = profile.mediaAffinity.get(post.mediaType)
  if (med && med > 0)
    raw.push({
      key: `formato:${post.mediaType}`,
      via: 'formato',
      weight: med,
      raw: FOR_YOU.mediaWeight * Math.log1p(med),
    })

  if (profile.seen.has(post.uri))
    penalties.push({reason: 'visto', factor: FOR_YOU.seenFactor})
  if (profile.lessPosts.has(post.uri))
    penalties.push({reason: 'mostrar-menos', factor: FOR_YOU.lessFactor})

  const factor = penalties.reduce((f, p) => f * p.factor, 1) * freshness
  const engagement = post.likeCount + 2 * post.repostCount + 3 * post.replyCount
  const hotRaw = FOR_YOU.hotWeight * Math.log1p(Math.max(0, engagement))
  const score = (FOR_YOU.base + raw.reduce((s, r) => s + r.raw, 0) + hotRaw) * factor
  return {
    uri: post.uri,
    score,
    freshness,
    ageHours,
    hot: {
      likes: post.likeCount,
      reposts: post.repostCount,
      replies: post.replyCount,
      points: hotRaw * factor,
    },
    base: FOR_YOU.base * factor,
    contributions: raw
      .map(({raw: r, ...c}) => ({...c, points: r * factor}))
      .sort((x, y) => y.points - x.points || x.key.localeCompare(y.key)),
    penalties,
  }
}

export function scoreCandidate(
  post: Candidate,
  profile: ViewerProfile,
  now: number,
): number {
  return explainCandidate(post, profile, now).score
}

/**
 * Espalha os autores: em cada rodada, no máximo um item por autor, mantendo a
 * ordem relativa (o melhor de cada autor primeiro).
 */
export function diversify<T extends {author: string}>(items: T[]): T[] {
  const queues = new Map<string, T[]>()
  for (const it of items) {
    const q = queues.get(it.author)
    if (q) q.push(it)
    else queues.set(it.author, [it])
  }
  const out: T[] = []
  while (out.length < items.length)
    for (const q of queues.values()) {
      const next = q.shift()
      if (next) out.push(next)
    }
  return out
}

export function rank(
  candidates: Candidate[],
  profile: ViewerProfile,
  now: number,
): Array<Candidate & {score: number}> {
  return rankExplained(candidates, profile, now).map(r => ({
    ...r.candidate,
    score: r.explanation.score,
  }))
}

export function rankExplained(
  candidates: Candidate[],
  profile: ViewerProfile,
  now: number,
) {
  const scored = candidates
    .map(candidate => ({
      candidate,
      author: candidate.author,
      explanation: explainCandidate(candidate, profile, now),
    }))
    .sort(
      (a, b) =>
        b.explanation.score - a.explanation.score ||
        (a.candidate.uri < b.candidate.uri ? -1 : 1),
    )
  return diversify(scored)
}

/** Explicação compacta para o feedContext do getFeedSkeleton (≤ 2000 chars). */
export function feedContextOf(e: Explanation): string {
  const r = (n: number) => Math.round(n * 100) / 100
  const ctx = {
    v: 1,
    a: 'pra-voce',
    s: r(e.score),
    f: r(e.freshness),
    h: r(e.hot.points),
    c: e.contributions
      .slice(0, 6)
      .map(c => [c.key, c.via, r(c.points), ...(c.through ? [c.through] : [])]),
    p: e.penalties.map(p => p.reason),
  }
  let out = JSON.stringify(ctx)
  while (out.length > 2000 && ctx.c.length) {
    ctx.c.pop()
    out = JSON.stringify(ctx)
  }
  return out
}
