// Ponte com o Git pessoal (aqua-personal-git): cada mudança no perfil de
// Convenções vira um commit no layout da Base de Sínteses
// (7-convencoes-de-realidade/convencoes/<id16>.json), com o porquê, a fonte e
// se foi explícito (usuário) ou inferido (Aqua). Daí saem o histórico e a
// tendência que o usuário vê em "Minhas Convenções".
import {
  caminhoDe,
  certeza,
  createRepo,
  type Fonte,
  importBranch,
  type Json,
  type Repo,
  type SemanticCommit,
  type Status,
} from 'aqua-personal-git'

import type {ConventionKey} from './model.ts'
import type {ProfileConvention} from './profile.ts'

export const BRANCH = 'private'

export function loadRepo(did: string, bundle: unknown): Repo {
  if (!bundle) return createRepo(did)
  return importBranch(bundle as Parameters<typeof importBranch>[0])
}

/** O que vai para o Git: só o que muda de verdade (gravidade com 1 casa). */
function objetoDe(c: ProfileConvention, criadaEm: string): Record<string, Json> {
  const o: Record<string, Json> = {
    id: c.id,
    tipo: c.tipo,
    nomes: [c.nome],
    descricao: '',
    forca: Math.min(10, Math.max(1, Math.round(c.dims.intensity))),
    esfera: 3,
    criada_em: criadaEm,
    fonte: c.fonte,
    status: c.status,
    gravidade: Math.round(c.gravidade * 10) / 10,
    estado: c.estado,
  }
  if (c.boost !== 1) o.reforco = c.boost
  if (c.silenciada) o.silenciada = true
  return o
}

/**
 * Grava as Convenções que mudaram (ou sumiram). `only` limita a algumas chaves
 * (ex.: o ajuste que o usuário acabou de fazer). Sem mudança, não há commit.
 */
export function snapshotProfile(
  repo: Repo,
  conventions: ProfileConvention[],
  o: {
    reason: string
    fonte: Fonte
    status: Status
    now: number
    only?: ConventionKey[]
    evidenceRefs?: string[]
  },
): SemanticCommit | undefined {
  const head = repo.treeAt(repo.refs.get(BRANCH))
  const changes: Record<string, unknown> = {}
  const present = new Set<string>()
  const pick = o.only ? new Set(o.only) : undefined
  for (const c of conventions) {
    const caminho = caminhoDe('convencoes', c)
    present.add(caminho)
    if (pick && !pick.has(c.key)) continue
    // dormentes quase zeradas e inferidas não precisam ocupar o histórico
    if (c.fonte === 'aqua' && c.gravidade < 0.05 && !c.silenciada) {
      present.delete(caminho)
      continue
    }
    const anterior = repo.read(BRANCH, caminho) as Record<string, Json> | undefined
    const criadaEm =
      (anterior?.criada_em as string | undefined) ?? new Date(o.now).toISOString()
    changes[caminho] = objetoDe(c, criadaEm)
  }
  for (const caminho of Object.keys(head)) {
    if (!caminho.startsWith('7-convencoes-de-realidade/convencoes/')) continue
    if (present.has(caminho)) continue
    if (pick) {
      const obj = repo.read(BRANCH, caminho) as Record<string, Json> | undefined
      if (!obj || !pick.has(`${obj.tipo}:${(obj.nomes as string[])[0]}`)) continue
    }
    changes[caminho] = null // apagada, marcada como errada ou zerada
  }
  return repo.commit(BRANCH, {
    changes,
    reason: o.reason,
    fonte: o.fonte,
    status: o.status,
    evidenceRefs: o.evidenceRefs ?? [],
    timestamp: new Date(o.now).toISOString(),
  })
}

export interface HistoryEntry {
  hash: string
  at: string
  reason: string
  fonte: string
  status: string
  certeza: 'explicito' | 'verificado' | 'inferido'
  changes: Array<{
    key: ConventionKey
    kind: 'added' | 'modified' | 'removed'
    fields: Array<{field: string; before?: Json; after?: Json}>
  }>
}

function keyFromObjects(
  objects: Record<string, Json>,
  before?: string,
  after?: string,
) {
  const obj = (after && objects[after]) || (before && objects[before])
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined
  const o = obj as Record<string, Json>
  return `${o.tipo}:${(o.nomes as string[])[0]}`
}

/** Histórico legível (mais novo primeiro), opcionalmente de uma chave só. */
export function historyOf(
  repo: Repo,
  opts: {key?: ConventionKey; limit?: number} = {},
): HistoryEntry[] {
  const out: HistoryEntry[] = []
  const objects = repo.exportBranch(BRANCH).objects as Record<string, Json>
  for (const c of repo.log(BRANCH)) {
    const changes = c.changedObjects
      .map(ch => ({
        key: keyFromObjects(objects, ch.before, ch.after) ?? ch.path,
        kind: ch.kind,
        fields: ch.fields.filter(f => f.field !== 'criada_em'),
      }))
      .filter(ch => !opts.key || ch.key === opts.key)
    if (!changes.length) continue
    out.push({
      hash: c.hash,
      at: c.timestamp,
      reason: c.reason,
      fonte: c.fonte,
      status: c.status,
      certeza: certeza(c),
      changes,
    })
    if (opts.limit && out.length >= opts.limit) break
  }
  return out
}

/** Série da gravidade por Convenção (mais antigo primeiro), para o gráfico. */
export function trendOf(
  repo: Repo,
  limitPerKey = 30,
): Record<ConventionKey, Array<{at: string; gravidade: number}>> {
  const out: Record<string, Array<{at: string; gravidade: number}>> = {}
  for (const e of historyOf(repo).reverse())
    for (const ch of e.changes) {
      const g = ch.fields.find(f => f.field === 'gravidade')
      const value = ch.kind === 'removed' ? 0 : (g?.after as number | undefined)
      if (value === undefined) continue
      const serie = (out[ch.key] ??= [])
      serie.push({at: e.at, gravidade: value})
      if (serie.length > limitPerKey) serie.shift()
    }
  return out
}
