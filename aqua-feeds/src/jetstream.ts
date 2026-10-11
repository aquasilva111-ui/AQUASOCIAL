// Jetstream (firehose em JSON) → operações no índice.
import WebSocket from 'ws'

import {
  conventionKeys,
  mediaTypeOf,
  normalizeText,
  tagsFromRecord,
} from './conventions/extract.ts'
import type {IndexedInteraction, IndexedPost, Store} from './store.ts'

/**
 * #tags do post: as facets (o app oficial sempre manda) e o campo `tags`;
 * se não houver nenhuma, lê as #hashtags do próprio texto.
 */
export function tagsOf(r: {text?: unknown; tags?: unknown; facets?: unknown}) {
  const tags = tagsFromRecord(r)
  if (tags.length || typeof r.text !== 'string') return tags
  const fromText = [...r.text.matchAll(/(?:^|\s)#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu)].map(
    m => m[1]!,
  )
  return tagsFromRecord({tags: fromText})
}

export const COLLECTIONS = {
  post: 'app.bsky.feed.post',
  like: 'app.bsky.feed.like',
  repost: 'app.bsky.feed.repost',
  /** só vira sinal para quem usa o "Pra você" (criador:<did>) */
  follow: 'app.bsky.graph.follow',
} as const

export interface JetstreamEvent {
  did: string
  time_us: number
  kind: string
  commit?: {
    operation: 'create' | 'update' | 'delete'
    collection: string
    rkey: string
    record?: Record<string, any>
  }
}

export type Op =
  | {type: 'post'; post: IndexedPost}
  | {type: 'reply'; uri: string; parent: string; actor: string; at: number}
  | {type: 'interaction'; interaction: IndexedInteraction}
  | {type: 'follow'; uri: string; actor: string; subject: string; at: number}
  | {type: 'delete'; uri: string}

export interface Filter {
  /** Prefixos de idioma aceitos ("pt" aceita "pt-BR"). Vazio = todos. */
  langs: string[]
  /** Se não vazio, só posts destes autores entram no feed. */
  authorDids: string[]
}

const isAtUri = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('at://')

export function langMatches(postLangs: unknown, wanted: string[]): boolean {
  if (!wanted.length) return true
  if (!Array.isArray(postLangs)) return false
  return postLangs.some(
    l =>
      typeof l === 'string' &&
      wanted.some(
        w => l.toLowerCase() === w || l.toLowerCase().startsWith(`${w}-`),
      ),
  )
}

/** Traduz um evento do Jetstream; eventos irrelevantes viram []. */
export function toOps(evt: JetstreamEvent, filter: Filter): Op[] {
  const c = evt.commit
  if (evt.kind !== 'commit' || !c) return []
  const known = Object.values(COLLECTIONS) as string[]
  if (!known.includes(c.collection)) return []
  const uri = `at://${evt.did}/${c.collection}/${c.rkey}`
  const at = Math.floor(evt.time_us / 1000)

  if (c.operation === 'delete') return [{type: 'delete', uri}]
  if (c.operation !== 'create' || !c.record) return []
  const r = c.record

  if (c.collection === COLLECTIONS.post) {
    const parent = r.reply?.parent?.uri
    if (isAtUri(parent))
      return [{type: 'reply', uri, parent, actor: evt.did, at}]
    if (filter.authorDids.length && !filter.authorDids.includes(evt.did))
      return []
    if (!langMatches(r.langs, filter.langs)) return []
    const langs: string[] = Array.isArray(r.langs)
      ? r.langs.filter((l: unknown) => typeof l === 'string').slice(0, 3)
      : []
    const mediaType = mediaTypeOf(r)
    const labels = Array.isArray(r.labels?.values)
      ? r.labels.values
          .map((v: {val?: unknown}) => v?.val)
          .filter((v: unknown): v is string => typeof v === 'string')
      : []
    return [
      {
        type: 'post',
        post: {
          uri,
          author: evt.did,
          indexedAt: at,
          isReply: false,
          langs,
          mediaType,
          convKeys: conventionKeys({
            author: evt.did,
            mediaType,
            tags: tagsOf(r),
            ...(langs[0] ? {lang: langs[0]} : {}),
            labels,
          }),
          text: typeof r.text === 'string' ? normalizeText(r.text) : '',
        },
      },
    ]
  }

  if (c.collection === COLLECTIONS.follow) {
    const subject = r.subject
    if (typeof subject !== 'string' || !subject.startsWith('did:')) return []
    return [{type: 'follow', uri, actor: evt.did, subject, at}]
  }

  const subject = r.subject?.uri
  if (!isAtUri(subject)) return []
  return [
    {
      type: 'interaction',
      interaction: {
        uri,
        kind: c.collection === COLLECTIONS.like ? 'like' : 'repost',
        subject,
        actor: evt.did,
        createdAt: at,
      },
    },
  ]
}

export async function applyOps(store: Store, ops: Op[]) {
  for (const op of ops) {
    if (op.type === 'post') await store.addPost(op.post)
    else if (op.type === 'reply')
      await store.addReply(op.uri, op.parent, op.actor, op.at)
    else if (op.type === 'interaction')
      await store.addInteraction(op.interaction)
    else if (op.type === 'follow')
      await store.addFollow(op.uri, op.actor, op.subject, op.at)
    else await store.deleteRecord(op.uri)
  }
}

export function subscribeUrl(base: string, cursor?: number) {
  const u = new URL(base)
  for (const c of Object.values(COLLECTIONS))
    u.searchParams.append('wantedCollections', c)
  if (cursor) u.searchParams.set('cursor', String(cursor))
  return u.toString()
}

/**
 * Assina o Jetstream e mantém o índice. Reconecta sozinho e retoma do último
 * time_us salvo (menos 5 s, para não perder nada na troca de conexão).
 */
export function startJetstream(opts: {
  url: string
  store: Store
  filter: Filter
  log?: (m: string) => void
}) {
  const {store, filter} = opts
  const log = opts.log ?? (m => console.log(`[jetstream] ${m}`))
  let ws: WebSocket | undefined
  let stopped = false
  let lastTimeUs = 0
  let backoff = 1000
  let queue = Promise.resolve()

  const saver = setInterval(() => {
    if (lastTimeUs) store.setCursor('jetstream', lastTimeUs).catch(() => {})
  }, 5000)

  const connect = async () => {
    const saved = await store.getCursor('jetstream')
    const cursor = saved ? saved - 5_000_000 : undefined
    ws = new WebSocket(subscribeUrl(opts.url, cursor))
    ws.on('open', () => {
      backoff = 1000
      log(`conectado${cursor ? ` (retomando de ${cursor})` : ''}`)
    })
    ws.on('message', data => {
      let evt: JetstreamEvent
      try {
        evt = JSON.parse(data.toString())
      } catch {
        return
      }
      const ops = toOps(evt, filter)
      lastTimeUs = Math.max(lastTimeUs, evt.time_us || 0)
      if (!ops.length) return
      queue = queue
        .then(() => applyOps(store, ops))
        .catch(e => log(`erro ao indexar: ${e}`))
    })
    ws.on('close', () => {
      if (stopped) return
      log(`desconectado; tentando de novo em ${backoff} ms`)
      setTimeout(() => connect().catch(e => log(String(e))), backoff)
      backoff = Math.min(backoff * 2, 60_000)
    })
    ws.on('error', e => log(`erro: ${e.message}`))
  }

  connect().catch(e => log(String(e)))
  return {
    async stop() {
      stopped = true
      clearInterval(saver)
      ws?.close()
      await queue
      if (lastTimeUs) await store.setCursor('jetstream', lastTimeUs)
    },
  }
}
