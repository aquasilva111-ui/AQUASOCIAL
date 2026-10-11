// O perfil de Convenções de um usuário, calculado SÓ a partir de dados que ele
// pode ver: os sinais dele (curtir, repostar, responder, salvar, seguir, tempo
// de leitura, "mostrar menos/mais") e os ajustes explícitos que ele fez.
// Função pura: mesmos sinais + mesmos ajustes + mesmo "agora" = mesmo perfil.
import {GRAVITY, gravity, type GravityDims, stateOf} from './gravity.ts'
import {
  type ConventionKey,
  conventionId,
  ESTADO_PT,
  type GravityState,
  splitKey,
} from './model.ts'
import {synapsesFromEvents} from './synapse.ts'

export type SignalKind =
  | 'like'
  | 'repost'
  | 'reply'
  | 'save'
  | 'follow'
  | 'dwell'
  | 'more'
  | 'less'
  | 'seen'

/** Peso de cada sinal. "less" é negativo; "seen" só serve para não repetir. */
export const SIGNAL_WEIGHTS: Record<SignalKind, number> = {
  like: 1,
  repost: 2,
  reply: 2,
  save: 3,
  follow: 4,
  dwell: 1, // por 20 s de leitura, até 3
  more: 2,
  less: -3,
  seen: 0,
}

export function signalWeight(kind: SignalKind, seconds?: number): number {
  if (kind === 'dwell') return Math.min(3, Math.max(0, (seconds ?? 0) / 20))
  return SIGNAL_WEIGHTS[kind]
}

export interface Signal {
  kind: SignalKind
  at: number
  keys: ConventionKey[]
  /** post (ou perfil) que gerou o sinal */
  subject?: string
  seconds?: number
}

export type AdjustAction =
  | 'add'
  | 'boost'
  | 'mute'
  | 'unmute'
  | 'delete'
  | 'wrong'

export interface Adjustment {
  key: ConventionKey
  action: AdjustAction
  at: number
  /** boost: multiplicador (0,25–4). */
  factor?: number
  note?: string
}

export const EXPLICIT_GRAVITY = 3
export const BOOST_RANGE = [0.25, 4] as const
const DAY = 86_400_000

export interface ProfileConvention {
  key: ConventionKey
  /** id de significado (o mesmo da U.I./Base de Sínteses) */
  id: string
  tipo: string
  nome: string
  gravidade: number
  /** gravidade antes de boost/mute (o que os sinais sozinhos dão) */
  gravidadeInferida: number
  estado: (typeof ESTADO_PT)[GravityState]
  /** "usuario" se ele adicionou; senão "aqua" (inferida da atividade) */
  fonte: 'usuario' | 'aqua'
  status: 'confirmado' | 'hipótese'
  certeza: 'explicito' | 'inferido'
  boost: number
  silenciada: boolean
  dims: GravityDims
  /** quantos sinais de cada tipo */
  sinais: Partial<Record<SignalKind, number>>
  ultimoSinal?: string
}

export interface ViewerProfile {
  authorAffinity: Map<string, number>
  mediaAffinity: Map<string, number>
  seen: Set<string>
  lessPosts: Set<string>
  /** chave → peso usado no ranking (já com boost; silenciadas ficam fora) */
  conventionGravity?: Map<ConventionKey, number>
  muted?: Set<ConventionKey>
  /** Sinapses do usuário: "a\u0000b" → quantas vezes coocorreram */
  synapses?: Map<string, number>
}

export const EMPTY_PROFILE: ViewerProfile = {
  authorAffinity: new Map(),
  mediaAffinity: new Map(),
  seen: new Set(),
  lessPosts: new Set(),
  conventionGravity: new Map(),
  muted: new Set(),
  synapses: new Map(),
}

export interface ConventionProfile {
  conventions: ProfileConvention[]
  viewer: ViewerProfile
  /** chaves que o usuário marcou como erradas (a Aqua não volta a inferir) */
  blocked: ConventionKey[]
}

const clampBoost = (f: number | undefined) =>
  Math.min(BOOST_RANGE[1], Math.max(BOOST_RANGE[0], f ?? 2))

/** Estado final de ajustes por chave (o mais recente de cada família vale). */
function foldAdjustments(adjs: Adjustment[]) {
  const by = new Map<
    ConventionKey,
    {
      explicitAt?: number
      forgetBefore?: number
      blocked?: boolean
      boost: number
      muted: boolean
    }
  >()
  for (const a of [...adjs].sort((x, y) => x.at - y.at)) {
    const s = by.get(a.key) ?? {boost: 1, muted: false}
    switch (a.action) {
      case 'add':
        s.explicitAt = a.at
        s.blocked = false
        break
      case 'boost':
        s.boost = clampBoost(a.factor)
        break
      case 'mute':
        s.muted = true
        break
      case 'unmute':
        s.muted = false
        break
      case 'delete':
        s.forgetBefore = a.at
        s.explicitAt = undefined
        s.boost = 1
        s.muted = false
        break
      case 'wrong':
        s.forgetBefore = a.at
        s.explicitAt = undefined
        s.blocked = true
        s.boost = 1
        break
    }
    by.set(a.key, s)
  }
  return by
}

export function buildProfile(
  signals: Signal[],
  adjustments: Adjustment[],
  now: number,
  opts: {halfLifeDays?: number; recentDays?: number} = {},
): ConventionProfile {
  const adj = foldAdjustments(adjustments)
  const recent = now - (opts.recentDays ?? 3) * DAY
  const seen = new Set<string>()
  const lessPosts = new Set<string>()
  type Acc = {
    intensity: number
    frequency: number
    days: Set<number>
    kinds: Set<SignalKind>
    last: number
    count: Partial<Record<SignalKind, number>>
  }
  const acc = new Map<ConventionKey, Acc>()
  const kept: Signal[] = []

  for (const s of signals) {
    if (s.at > now) continue
    if (s.subject && s.at >= recent) {
      if (s.kind === 'seen') seen.add(s.subject)
      if (s.kind === 'less') lessPosts.add(s.subject)
    }
    const w = signalWeight(s.kind, s.seconds)
    if (w === 0) continue
    const keys = s.keys.filter(k => {
      const a = adj.get(k)
      if (!a) return true
      if (a.forgetBefore !== undefined && s.at <= a.forgetBefore) return false
      return !(a.blocked && a.explicitAt === undefined)
    })
    if (!keys.length) continue
    kept.push({...s, keys})
    for (const k of keys) {
      const x = acc.get(k) ?? {
        intensity: 0,
        frequency: 0,
        days: new Set(),
        kinds: new Set(),
        last: 0,
        count: {},
      }
      x.intensity += w
      x.count[s.kind] = (x.count[s.kind] ?? 0) + 1
      if (w > 0) {
        x.frequency += 1
        x.days.add(Math.floor(s.at / DAY))
        x.kinds.add(s.kind)
        x.last = Math.max(x.last, s.at)
      }
      acc.set(k, x)
    }
  }

  // Sinapses: coocorrência em sinais positivos da mesma sessão.
  const synapses = new Map<string, number>()
  const partners = new Map<ConventionKey, Set<ConventionKey>>()
  for (const o of synapsesFromEvents(
    kept.map(s => ({
      createdAt: new Date(s.at).toISOString(),
      weight: signalWeight(s.kind, s.seconds),
      keys: s.keys.filter(k => !k.startsWith('idioma:')),
    })),
  )) {
    const id = `${o.a}\u0000${o.b}`
    synapses.set(id, (synapses.get(id) ?? 0) + 1)
    for (const [x, y] of [
      [o.a, o.b],
      [o.b, o.a],
    ] as const) {
      const p = partners.get(x) ?? new Set()
      p.add(y)
      partners.set(x, p)
    }
  }

  const keys = new Set<ConventionKey>([...acc.keys()])
  for (const [k, a] of adj) if (a.explicitAt !== undefined) keys.add(k)

  const conventions: ProfileConvention[] = []
  for (const key of keys) {
    let parts: {tipo: string; nome: string}
    try {
      parts = splitKey(key)
    } catch {
      continue
    }
    const x = acc.get(key)
    const a = adj.get(key)
    const explicit = a?.explicitAt !== undefined
    const dims: GravityDims = {
      intensity: Math.max(0, x?.intensity ?? 0),
      frequency: x?.frequency ?? 0,
      persistence: x?.days.size ?? 0,
      diversity: x?.kinds.size ?? 0,
      connectivity: partners.get(key)?.size ?? 0,
      recencyDays: x?.last ? (now - x.last) / DAY : explicit ? 0 : Infinity,
    }
    const inferred = x && x.intensity > 0 ? gravity(dims, opts.halfLifeDays) : 0
    if (!explicit && inferred <= 0) continue
    const base = explicit ? Math.max(EXPLICIT_GRAVITY, inferred) : inferred
    const boost = a?.boost ?? 1
    const muted = a?.muted ?? false
    const state = explicit && !x ? 'active' : stateOf(dims, opts.halfLifeDays)
    conventions.push({
      key,
      id: conventionId(key),
      tipo: parts.tipo,
      nome: parts.nome,
      gravidade: round(muted ? 0 : base * boost),
      gravidadeInferida: round(inferred),
      estado: ESTADO_PT[state],
      fonte: explicit ? 'usuario' : 'aqua',
      status: explicit ? 'confirmado' : 'hipótese',
      certeza: explicit ? 'explicito' : 'inferido',
      boost,
      silenciada: muted,
      dims: {...dims, recencyDays: round(dims.recencyDays)},
      sinais: x?.count ?? {},
      ...(x?.last ? {ultimoSinal: new Date(x.last).toISOString()} : {}),
    })
  }
  // Silenciadas sem sinal nenhum também aparecem (para poder desfazer).
  for (const [key, a] of adj)
    if (a.muted && !conventions.some(c => c.key === key)) {
      try {
        const p = splitKey(key)
        conventions.push({
          key,
          id: conventionId(key),
          ...p,
          gravidade: 0,
          gravidadeInferida: 0,
          estado: 'dormente',
          fonte: 'aqua',
          status: 'hipótese',
          certeza: 'inferido',
          boost: a.boost,
          silenciada: true,
          dims: {
            intensity: 0,
            frequency: 0,
            persistence: 0,
            diversity: 0,
            connectivity: 0,
            recencyDays: 0,
          },
          sinais: {},
        })
      } catch {}
    }
  conventions.sort((p, q) => q.gravidade - p.gravidade || p.key.localeCompare(q.key))

  const viewer: ViewerProfile = {
    authorAffinity: new Map(),
    mediaAffinity: new Map(),
    seen,
    lessPosts,
    conventionGravity: new Map(),
    muted: new Set(conventions.filter(c => c.silenciada).map(c => c.key)),
    synapses,
  }
  for (const c of conventions) {
    if (c.silenciada || c.gravidade <= 0) continue
    // criador/formato vão para as afinidades (pesos próprios no score)
    if (c.tipo === 'criador') viewer.authorAffinity.set(c.nome, c.gravidade)
    else if (c.tipo === 'formato') viewer.mediaAffinity.set(c.nome, c.gravidade)
    else viewer.conventionGravity!.set(c.key, c.gravidade)
  }
  return {
    conventions,
    viewer,
    blocked: [...adj].filter(([, a]) => a.blocked).map(([k]) => k),
  }
}

const round = (n: number) =>
  Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n

export {GRAVITY}
