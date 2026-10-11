// Ranking "Em alta": pontuação hot + limite de posts por autor. Funções puras.

export interface Candidate {
  uri: string
  author: string
  /** Quando o post chegou ao indexador (ms). A idade usa isto, não o createdAt do registro, que o autor controla. */
  indexedAt: number
  likes: number
  reposts: number
  replies: number
}

export const WEIGHTS = {like: 1, repost: 2, reply: 3}
/** Horas somadas à idade: post recém-criado não divide por ~0. */
export const AGE_OFFSET_HOURS = 2
/** Quanto mais alto, mais rápido um post envelhece. */
export const GRAVITY = 1.5

export function engagement(
  c: Pick<Candidate, 'likes' | 'reposts' | 'replies'>,
): number {
  return (
    c.likes * WEIGHTS.like +
    c.reposts * WEIGHTS.repost +
    c.replies * WEIGHTS.reply
  )
}

/** (likes + 2·reposts + 3·replies) / (horas + 2)^1.5 */
export function hotScore(c: Candidate, now: number): number {
  const hours = Math.max(0, (now - c.indexedAt) / 3_600_000)
  return engagement(c) / Math.pow(hours + AGE_OFFSET_HOURS, GRAVITY)
}

export interface RankOptions {
  /** No máximo N posts do mesmo autor na lista inteira. */
  maxPerAuthor: number
  /** Engajamento ponderado mínimo para entrar. */
  minEngagement: number
  /** Tamanho máximo da lista. */
  limit: number
}

export const DEFAULT_RANK: RankOptions = {
  maxPerAuthor: 3,
  minEngagement: 1,
  limit: 1000,
}

export interface Ranked {
  uri: string
  author: string
  score: number
}

/**
 * Ordena por hotScore (empate: mais novo primeiro, depois uri, para ser
 * determinístico) e aplica o limite por autor: o (maxPerAuthor+1)º post de
 * um autor sai da lista, abrindo espaço para outras pessoas.
 */
export function rankHot(
  candidates: Candidate[],
  now: number,
  opts: Partial<RankOptions> = {},
): Ranked[] {
  const {maxPerAuthor, minEngagement, limit} = {...DEFAULT_RANK, ...opts}
  const scored = candidates
    .filter(c => engagement(c) >= minEngagement)
    .map(c => ({c, score: hotScore(c, now)}))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.c.indexedAt - a.c.indexedAt ||
        (a.c.uri < b.c.uri ? -1 : a.c.uri > b.c.uri ? 1 : 0),
    )
  const perAuthor = new Map<string, number>()
  const out: Ranked[] = []
  for (const {c, score} of scored) {
    const n = perAuthor.get(c.author) ?? 0
    if (n >= maxPerAuthor) continue
    perAuthor.set(c.author, n + 1)
    out.push({uri: c.uri, author: c.author, score})
    if (out.length >= limit) break
  }
  return out
}
