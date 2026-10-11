// Repositório semântico estilo Git, em memória e sem I/O. Quem guarda (PDS,
// banco cifrado, arquivo) é outra camada: aqui só há objetos, árvores,
// commits e refs endereçados por hash.
import {hashOf, type Hash, type Json} from './canonical.ts'
import {diffFields, type FieldChange} from './diff.ts'

export type CommitSource =
  | 'explicit_user_input'
  | 'event_digest'
  | 'synthesis'
  | 'import'
  | 'manual_edit'
  | 'ui'

/** Caminho → hash do objeto. Ex.: "conventions/music-production.json". */
export type Tree = Record<string, Hash>

export interface ObjectChange {
  path: string
  kind: 'added' | 'modified' | 'removed'
  before?: Hash
  after?: Hash
  fields: FieldChange[]
}

export interface SemanticCommit {
  /** = hash */
  id: Hash
  hash: Hash
  userId: string
  branch: string
  timestamp: string
  parentCommitId: Hash | null
  tree: Hash
  changedObjects: ObjectChange[]
  reason: string
  /** Referências opacas à evidência (ids de eventos digeridos), nunca o dado bruto. */
  evidenceRefs: string[]
  source: CommitSource
  /** explicit = o usuário disse; inferred = a AQUA/U.I. deduziu. */
  certainty: 'explicit' | 'inferred'
  confidenceChange?: {
    path: string
    field: string
    before: number
    after: number
  }
}

export interface CommitInput {
  /** valor novo do objeto; null remove o caminho */
  changes: Record<string, Json | null>
  reason: string
  evidenceRefs?: string[]
  source: CommitSource
  certainty?: 'explicit' | 'inferred'
  confidenceChange?: SemanticCommit['confidenceChange']
  timestamp?: string
}

export class ConflictError extends Error {}

export function commitHash(c: Omit<SemanticCommit, 'id' | 'hash'>): Hash {
  return hashOf(c as unknown as Json)
}

export function createRepo(userId: string) {
  const objects = new Map<Hash, Json>()
  const trees = new Map<Hash, Tree>()
  const commits = new Map<Hash, SemanticCommit>()
  const refs = new Map<string, Hash>()

  const putObject = (v: Json) => {
    const h = hashOf(v)
    objects.set(h, v)
    return h
  }
  const putTree = (t: Tree) => {
    const h = hashOf(t)
    trees.set(h, {...t})
    return h
  }
  const EMPTY_TREE = putTree({})

  function treeAt(commitId: Hash | null | undefined): Tree {
    if (!commitId) return {}
    const c = commits.get(commitId)
    if (!c) throw new Error(`commit desconhecido: ${commitId}`)
    return {...trees.get(c.tree)!}
  }

  function read(branch: string, path: string): Json | undefined {
    const h = treeAt(refs.get(branch))[path]
    return h ? objects.get(h) : undefined
  }

  function diffTrees(a: Tree, b: Tree): ObjectChange[] {
    const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    const out: ObjectChange[] = []
    for (const path of paths) {
      const before = a[path]
      const after = b[path]
      if (before === after) continue
      const change: ObjectChange = {
        path,
        kind: !before ? 'added' : !after ? 'removed' : 'modified',
        fields: diffFields(
          before ? objects.get(before) : undefined,
          after ? objects.get(after) : undefined,
        ),
      }
      if (before) change.before = before
      if (after) change.after = after
      out.push(change)
    }
    return out
  }

  /** Cria um commit no topo do branch. Sem mudança real, não cria nada. */
  function commit(
    branch: string,
    input: CommitInput,
  ): SemanticCommit | undefined {
    const parent = refs.get(branch) ?? null
    const base = treeAt(parent)
    const next: Tree = {...base}
    for (const [path, value] of Object.entries(input.changes)) {
      if (value === null) delete next[path]
      else next[path] = putObject(value)
    }
    const changedObjects = diffTrees(base, next)
    if (!changedObjects.length) return undefined
    const body: Omit<SemanticCommit, 'id' | 'hash'> = {
      userId,
      branch,
      timestamp: input.timestamp ?? new Date().toISOString(),
      parentCommitId: parent,
      tree: putTree(next),
      changedObjects,
      reason: input.reason,
      evidenceRefs: input.evidenceRefs ?? [],
      source: input.source,
      certainty:
        input.certainty ??
        (input.source === 'explicit_user_input' ||
        input.source === 'manual_edit'
          ? 'explicit'
          : 'inferred'),
      ...(input.confidenceChange
        ? {confidenceChange: input.confidenceChange}
        : {}),
    }
    const hash = commitHash(body)
    const c: SemanticCommit = {id: hash, hash, ...body}
    commits.set(hash, c)
    refs.set(branch, hash)
    return c
  }

  function log(branch: string): SemanticCommit[] {
    const out: SemanticCommit[] = []
    let at = refs.get(branch) ?? null
    while (at) {
      const c = commits.get(at)!
      out.push(c)
      at = c.parentCommitId
    }
    return out
  }

  /** Desfaz um commit com um commit novo (o histórico nunca é reescrito). */
  function revert(
    branch: string,
    commitId: Hash,
    reason = `revert ${commitId}`,
  ): SemanticCommit | undefined {
    const target = commits.get(commitId)
    if (!target || target.branch !== branch)
      throw new Error('commit não está neste branch')
    const head = treeAt(refs.get(branch))
    const changes: Record<string, Json | null> = {}
    for (const ch of target.changedObjects) {
      if (head[ch.path] !== ch.after) {
        throw new ConflictError(
          `${ch.path} mudou depois de ${commitId}; reverta os commits mais novos antes`,
        )
      }
      changes[ch.path] = ch.before ? objects.get(ch.before)! : null
    }
    return commit(branch, {
      changes,
      reason,
      source: 'manual_edit',
      certainty: 'explicit',
      evidenceRefs: [commitId],
    })
  }

  /** Volta o branch inteiro ao estado de um commit antigo (rollback), como um commit novo. */
  function restore(
    branch: string,
    commitId: Hash,
    reason = `restore ${commitId}`,
  ): SemanticCommit | undefined {
    const old = treeAt(commitId)
    const head = treeAt(refs.get(branch))
    const changes: Record<string, Json | null> = {}
    for (const path of new Set([...Object.keys(old), ...Object.keys(head)])) {
      if (old[path] !== head[path])
        changes[path] = old[path] ? objects.get(old[path])! : null
    }
    return commit(branch, {
      changes,
      reason,
      source: 'manual_edit',
      certainty: 'explicit',
      evidenceRefs: [commitId],
    })
  }

  /** Confere toda a cadeia: hashes de objetos, árvores e commits. */
  function verify(branch: string): boolean {
    for (const c of log(branch)) {
      const {id, hash, ...body} = c
      if (id !== hash || commitHash(body) !== hash) return false
      const tree = trees.get(c.tree)
      if (!tree || hashOf(tree) !== c.tree) return false
      for (const h of Object.values(tree))
        if (hashOf(objects.get(h)) !== h) return false
    }
    return true
  }

  /** Pacote portátil (JSON) de um branch, para exportar/backup/migrar. */
  function exportBranch(branch: string) {
    const chain = log(branch).reverse()
    const treeHashes = new Set(chain.map(c => c.tree))
    const objectHashes = new Set(
      [...treeHashes].flatMap(t => Object.values(trees.get(t)!)),
    )
    return {
      format: 'aqua-personal-git/1' as const,
      userId,
      branch,
      head: refs.get(branch) ?? null,
      commits: chain,
      trees: Object.fromEntries([...treeHashes].map(h => [h, trees.get(h)!])),
      objects: Object.fromEntries(
        [...objectHashes].map(h => [h, objects.get(h)!]),
      ),
    }
  }

  return {
    userId,
    EMPTY_TREE,
    commit,
    read,
    log,
    revert,
    restore,
    verify,
    exportBranch,
    diffTrees,
    treeAt,
    refs,
  }
}

export type Repo = ReturnType<typeof createRepo>
export type ExportBundle = ReturnType<Repo['exportBranch']>

/** Importa um pacote exportado, conferindo cada hash. */
export function importBranch(bundle: ExportBundle): Repo {
  if (bundle.format !== 'aqua-personal-git/1')
    throw new Error('formato desconhecido')
  for (const [h, v] of Object.entries(bundle.objects))
    if (hashOf(v) !== h) throw new Error(`objeto adulterado: ${h}`)
  for (const [h, t] of Object.entries(bundle.trees))
    if (hashOf(t) !== h) throw new Error(`árvore adulterada: ${h}`)
  const repo = createRepo(bundle.userId)
  let parent: Hash | null = null
  for (const c of bundle.commits) {
    const {id, hash, ...body} = c
    if (commitHash(body) !== hash || id !== hash || c.parentCommitId !== parent)
      throw new Error(`commit adulterado: ${hash}`)
    // reaplica mudança a mudança, o que recria objetos e árvores pelo mesmo hash
    const changes: Record<string, Json | null> = {}
    for (const ch of c.changedObjects)
      changes[ch.path] = ch.after ? (bundle.objects[ch.after] as Json) : null
    const re = repo.commit(bundle.branch, {
      changes,
      reason: c.reason,
      evidenceRefs: c.evidenceRefs,
      source: c.source,
      certainty: c.certainty,
      timestamp: c.timestamp,
      ...(c.confidenceChange ? {confidenceChange: c.confidenceChange} : {}),
    })
    if (re?.hash !== hash) throw new Error(`reprodução divergente em ${hash}`)
    parent = hash
  }
  return repo
}
