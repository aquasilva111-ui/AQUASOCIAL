// "Pra você": o feed por Convenções de Realidade, explicável e ajustável.
//
// Em palavras simples: cada coisa que você curte, reposta, salva, responde ou
// segue reforça as Convenções daquele post (#tema, idioma, rótulo, criador,
// formato). Cada Convenção tem uma gravidade que cresce com o uso e cai pela
// metade a cada 14 dias sem uso. Um post novo ganha pontos pelas suas
// Convenções que batem com as dele (e pelas Sinapses, Convenções que costumam
// andar juntas para você), mais um pouco pelo que está em alta; tudo isso cai
// pela metade a cada 12 horas de idade. No fim, os criadores são intercalados
// para ninguém dominar a lista. Cada post vem com o "porquê" anexado.
import {decodeCursor, encodeCursor} from '../../cursor.ts'
import type {Config} from '../../config.ts'
import {
  historyOf,
  loadRepo,
  snapshotProfile,
  trendOf,
  BRANCH,
} from '../../conventions/history.ts'
import {normalizeTag} from '../../conventions/extract.ts'
import {type ConventionKey, splitKey} from '../../conventions/model.ts'
import {
  type Adjustment,
  type AdjustAction,
  buildProfile,
  type ConventionProfile,
  type Signal,
  type SignalKind,
  EMPTY_PROFILE,
} from '../../conventions/profile.ts'
import {
  createSensitiveIndex,
  SENSITIVE_KEY_PREFIX,
  type SensitiveIndex,
} from '../../conventions/sensitive.ts'
import type {Store} from '../../store.ts'
import {
  type Explanation,
  explainCandidate,
  feedContextOf,
  rankExplained,
} from './score.ts'

export class BadCursorError extends Error {}
export class InvalidAdjustmentError extends Error {}

const DAY = 86_400_000
const CACHE_MAX = 500
const CACHE_TTL = 15 * 60_000
const TIPOS_AJUSTAVEIS = new Set(['tema', 'idioma', 'rotulo', 'criador', 'formato'])
const ACOES: AdjustAction[] = ['add', 'boost', 'mute', 'unmute', 'delete', 'wrong']

const fmt = (n: number) => n.toLocaleString('pt-BR', {maximumFractionDigits: 2})

/** Frases curtas em português para cada parte da explicação. */
export function reasonsOf(e: Explanation): string[] {
  const out: string[] = []
  for (const c of e.contributions) {
    const nome = c.key.slice(c.key.indexOf(':') + 1)
    const pts = `+${fmt(c.points)}`
    switch (c.via) {
      case 'tag':
        out.push(`Sua Convenção “${nome}” (gravidade ${fmt(c.weight)}) está nas tags do post (${pts}).`)
        break
      case 'texto':
        out.push(`O texto fala de “${nome}”, uma Convenção sua (gravidade ${fmt(c.weight)}) (${pts}).`)
        break
      case 'idioma':
        out.push(`Está em um idioma que você costuma ler: ${nome} (${pts}).`)
        break
      case 'rotulo':
        out.push(`Tem o rótulo “${nome}”, que você costuma ver (${pts}).`)
        break
      case 'criador':
        out.push(`Você interage com esta pessoa (afinidade ${fmt(c.weight)}) (${pts}).`)
        break
      case 'formato':
        out.push(`Você prefere este formato: ${nome} (${pts}).`)
        break
      case 'sinapse': {
        const ponte = c.through?.slice(c.through.indexOf(':') + 1)
        out.push(`Sinapse: para você, “${nome}” costuma andar junto com “${ponte}”, que está no post (${pts}).`)
        break
      }
    }
  }
  if (e.hot.points > 0)
    out.push(
      `Está em alta: ${e.hot.likes} curtidas, ${e.hot.reposts} reposts e ${e.hot.replies} respostas.`,
    )
  out.push(`Frescor: postado há ${fmt(e.ageHours)} h (vale ${Math.round(e.freshness * 100)}%).`)
  for (const p of e.penalties)
    out.push(
      p.reason === 'visto'
        ? 'Você já viu este post (pontos ×0,5).'
        : p.reason === 'mostrar-menos'
          ? 'Você pediu “mostrar menos” parecido (×0,3).'
          : `Tem “${p.key}”, que você silenciou (×0,1).`,
    )
  if (!e.contributions.length && e.hot.points === 0)
    out.push('Nenhuma Convenção sua bateu: entrou por ser recente.')
  return out
}

export function parseKey(raw: unknown): ConventionKey {
  if (typeof raw !== 'string' || raw.length > 200)
    throw new InvalidAdjustmentError('key deve ser "tipo:nome"')
  let p: {tipo: string; nome: string}
  try {
    p = splitKey(raw.trim())
  } catch {
    throw new InvalidAdjustmentError('key deve ser "tipo:nome"')
  }
  if (!TIPOS_AJUSTAVEIS.has(p.tipo))
    throw new InvalidAdjustmentError(
      `tipo deve ser um de: ${[...TIPOS_AJUSTAVEIS].join(', ')}`,
    )
  // mesma normalização das #tags dos posts (sem acento), para casar com eles
  const nome = p.tipo === 'criador' ? p.nome.trim() : normalizeTag(p.nome)
  if (!nome) throw new InvalidAdjustmentError('nome vazio')
  return `${p.tipo}:${nome}`
}

const RAZAO: Record<AdjustAction, (k: string, f?: number) => string> = {
  add: k => `Você adicionou a Convenção ${k}`,
  boost: (k, f) => `Você ajustou o peso de ${k} (×${fmt(f ?? 2)})`,
  mute: k => `Você silenciou ${k}`,
  unmute: k => `Você voltou a mostrar ${k}`,
  delete: k => `Você apagou ${k} (a Aqua esquece os sinais até agora)`,
  wrong: k => `Você marcou ${k} como errada (a Aqua não volta a inferir)`,
  optin: k => `Você permitiu que a Aqua infira Convenções da categoria sensível ${k}`,
  optout: k => `Você desligou a inferência da categoria sensível ${k} (as Convenções inferidas dela saem)`,
}

export function createForYou(
  store: Store,
  cfg: Pick<
    Config,
    'retentionHours' | 'signalRetentionDays' | 'digestHours' | 'forYouUri'
  >,
  clock: () => number = Date.now,
  sensitive: SensitiveIndex = createSensitiveIndex(),
) {
  type Ranked = ReturnType<typeof rankExplained>
  const cache = new Map<string, {at: number; ranked: Ranked}>()
  const remember = (k: string, ranked: Ranked) => {
    cache.set(k, {at: clock(), ranked})
    for (const [key, v] of cache)
      if (cache.size > CACHE_MAX || clock() - v.at > CACHE_TTL) cache.delete(key)
      else break
  }

  async function profileOf(did: string | undefined, now = clock()) {
    if (!did) return undefined
    const [signals, adjustments] = await Promise.all([
      store.signals(did, now - cfg.signalRetentionDays * DAY),
      store.adjustments(did),
    ])
    return buildProfile(signals, adjustments, now, {sensitive})
  }

  async function skeleton(p: {viewer?: string; cursor?: string; limit?: number}) {
    const limit = Math.min(100, Math.max(1, Math.floor(p.limit ?? 30) || 30))
    let ts = clock()
    let offset = 0
    if (p.cursor) {
      const c = decodeCursor(p.cursor)
      if (!c) throw new BadCursorError('Cursor inválido')
      ts = c.snapshot
      offset = c.offset
      if (clock() - ts > CACHE_TTL) return {feed: []} // velho: o app recarrega do topo
    } else if (p.viewer) await store.touchViewer(p.viewer)
    const cacheKey = `${p.viewer ?? '-'}|${ts}`
    let ranked = cache.get(cacheKey)?.ranked
    if (!ranked) {
      const profile = (await profileOf(p.viewer, ts))?.viewer ?? EMPTY_PROFILE
      const candidates = await store.forYouCandidates(ts, cfg.retentionHours)
      ranked = rankExplained(candidates, profile, ts)
      remember(cacheKey, ranked)
    }
    const page = ranked.slice(offset, offset + limit)
    return {
      feed: page.map(r => ({
        post: r.candidate.uri,
        feedContext: feedContextOf(r.explanation),
      })),
      cursor:
        offset + limit < ranked.length
          ? encodeCursor({snapshot: ts, offset: offset + limit})
          : undefined,
      reqId: `pv-${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    }
  }

  /** Por que estou vendo isso? Recalcula com o perfil de agora. */
  async function explain(viewer: string | undefined, uri: string) {
    const now = clock()
    const [post] = await store.forYouCandidates(now, cfg.retentionHours, 1, uri)
    if (!post) return undefined
    const profile = (await profileOf(viewer, now))?.viewer ?? EMPTY_PROFILE
    const e = explainCandidate(post, profile, now)
    return {
      uri,
      feed: cfg.forYouUri,
      personalizado: Boolean(viewer),
      explicacao: e,
      motivos: reasonsOf(e),
      convencoesDoPost: post.conventionKeys ?? [],
      formula:
        '(0,1 + Σ Convenções que batem + 0,6·ln(1 + curtidas + 2·reposts + 3·respostas)) × frescor(meia-vida 12 h) × penalidades',
    }
  }

  async function withRepo<T>(
    did: string,
    fn: (repo: ReturnType<typeof loadRepo>) => T,
  ): Promise<T> {
    const repo = loadRepo(did, await store.getRepoBundle(did))
    const before = repo.refs.get(BRANCH)
    const out = fn(repo)
    if (repo.refs.get(BRANCH) !== before)
      await store.saveRepoBundle(did, repo.exportBranch(BRANCH))
    return out
  }

  /** De tempos em tempos, o que a Aqua inferiu vira um commit "hipótese". */
  function digest(repo: ReturnType<typeof loadRepo>, prof: ConventionProfile, now: number) {
    const last = repo.log(BRANCH).find(c => c.fonte === 'aqua')
    if (last && now - Date.parse(last.timestamp) < cfg.digestHours * 3_600_000) return
    snapshotProfile(repo, prof.conventions, {
      reason: last
        ? `Resumo da sua atividade desde ${last.timestamp.slice(0, 16).replace('T', ' ')} UTC`
        : 'Primeiro resumo da sua atividade',
      fonte: 'aqua',
      status: 'hipótese',
      now,
    })
  }

  async function getProfile(did: string) {
    const now = clock()
    await store.touchViewer(did)
    const prof = (await profileOf(did, now))!
    const {trend, ultimaMudanca} = await withRepo(did, repo => {
      digest(repo, prof, now)
      return {trend: trendOf(repo), ultimaMudanca: repo.log(BRANCH)[0]?.timestamp}
    })
    return {
      did,
      geradoEm: new Date(now).toISOString(),
      ultimaMudanca,
      parametros: {
        meiaVidaGravidadeDias: 14,
        meiaVidaFrescorHoras: 12,
        gravidadeExplicita: 3,
        pesosDosSinais: {
          curtir: 1, repostar: 2, responder: 2, salvar: 3, seguir: 4,
          'tempo (por 20 s, até 3)': 1, 'mostrar mais': 2, 'mostrar menos': -3,
        },
      },
      convencoes: prof.conventions.map(c => ({...c, tendencia: trend[c.key] ?? []})),
      sinapses: [...(prof.viewer.synapses ?? [])]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([pair, vezes]) => {
          const [a, b] = pair.split('\u0000')
          return {a, b, vezes}
        }),
      bloqueadas: prof.blocked,
      categoriasSensiveis: sensitive.categories.map(c => ({
        id: c.id,
        nome: c.nome,
        descricao: c.descricao,
        ativa: prof.sensitiveOptIn.includes(c.id),
        exemplos: c.temas.slice(0, 5),
      })),
    }
  }

  /** Liga/desliga a inferência de uma categoria sensível (desligada por padrão). */
  async function setSensitive(did: string, body: {categoria?: unknown; ativa?: unknown}) {
    const cat = sensitive.categories.find(c => c.id === body.categoria)
    if (!cat)
      throw new InvalidAdjustmentError(
        `categoria deve ser uma de: ${sensitive.categories.map(c => c.id).join(', ')}`,
      )
    if (typeof body.ativa !== 'boolean')
      throw new InvalidAdjustmentError('ativa deve ser true ou false')
    const now = clock()
    const action: AdjustAction = body.ativa ? 'optin' : 'optout'
    await store.touchViewer(did)
    await store.addAdjustment(did, {key: `${SENSITIVE_KEY_PREFIX}${cat.id}`, action, at: now})
    for (const k of cache.keys()) if (k.startsWith(`${did}|`)) cache.delete(k)
    const prof = (await profileOf(did, now))!
    const commit = await withRepo(did, repo =>
      snapshotProfile(repo, prof.conventions, {
        reason: RAZAO[action](cat.nome),
        fonte: 'usuario',
        status: 'confirmado',
        now,
        // só as Convenções desta categoria entram/saem neste commit
        only: k => sensitive.categoryOf(k) === cat.id,
        extraChanges: {
          'sensiveis.json': {categorias_ativas: prof.sensitiveOptIn, atualizada_em: new Date(now).toISOString()},
        },
      }),
    )
    return {categoria: cat.id, ativa: body.ativa, commit: commit?.hash ?? null}
  }

  async function getHistory(did: string, key?: string, limit = 50) {
    const k = key ? parseKey(key) : undefined
    return withRepo(did, repo => ({
      did,
      verificado: repo.verify(BRANCH),
      historico: historyOf(repo, {...(k ? {key: k} : {}), limit: Math.min(200, limit)}),
    }))
  }

  async function adjust(
    did: string,
    body: {key?: unknown; action?: unknown; factor?: unknown; note?: unknown},
  ) {
    const key = parseKey(body.key)
    const action = body.action as AdjustAction
    if (!ACOES.includes(action))
      throw new InvalidAdjustmentError(`action deve ser um de: ${ACOES.join(', ')}`)
    let factor: number | undefined
    if (action === 'boost') {
      factor = body.factor === undefined ? 2 : Number(body.factor)
      if (!Number.isFinite(factor) || factor <= 0)
        throw new InvalidAdjustmentError('factor deve ser um número > 0')
    }
    const note = typeof body.note === 'string' ? body.note.slice(0, 300) : undefined
    const now = clock()
    const a: Adjustment = {key, action, at: now, ...(factor ? {factor} : {}), ...(note ? {note} : {})}
    await store.touchViewer(did)
    await store.addAdjustment(did, a)
    for (const k of cache.keys()) if (k.startsWith(`${did}|`)) cache.delete(k)
    const prof = (await profileOf(did, now))!
    const commit = await withRepo(did, repo =>
      snapshotProfile(repo, prof.conventions, {
        reason: RAZAO[action](key, factor) + (note ? ` — “${note}”` : ''),
        fonte: 'usuario',
        status: 'confirmado',
        now,
        only: [key],
      }),
    )
    return {
      ajuste: a,
      convencao: prof.conventions.find(c => c.key === key) ?? null,
      commit: commit?.hash ?? null,
    }
  }

  async function addSignal(did: string, kind: SignalKind, subject: string, seconds?: number) {
    await store.touchViewer(did)
    await store.addPostSignal(did, kind, subject, clock(), seconds)
  }

  return {
    profileOf,
    skeleton,
    explain,
    getProfile,
    getHistory,
    adjust,
    setSensitive,
    addSignal,
  }
}

export type ForYou = ReturnType<typeof createForYou>
export type {Signal}
