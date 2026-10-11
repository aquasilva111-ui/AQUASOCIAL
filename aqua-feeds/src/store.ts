// Índice dos posts recentes e das interações, e os snapshots do ranking.
import type {Db} from './db.ts'
import {type Candidate, rankHot, type RankOptions} from './score.ts'

export interface IndexedPost {
  uri: string
  author: string
  indexedAt: number
  isReply: boolean
  langs: string[]
  /** at:// do post respondido (vira uma interação "reply" se o pai estiver indexado). */
  replyParent?: string
}

export interface IndexedInteraction {
  uri: string
  kind: 'like' | 'repost'
  subject: string
  actor: string
  createdAt: number
}

const iso = (ms: number) => new Date(ms).toISOString()

export function createStore(db: Db) {
  /**
   * URIs indexadas em memória: a maior parte das curtidas da rede é em posts
   * que não indexamos, e assim elas são descartadas sem tocar no banco.
   */
  const known = new Set<string>()

  return {
    known,

    async loadKnown() {
      known.clear()
      for (const r of await db.query<{uri: string}>('select uri from posts'))
        known.add(r.uri)
    },

    async addPost(p: IndexedPost) {
      await db.query(
        `insert into posts (uri, author_did, indexed_at, is_reply, langs)
         values ($1, $2, $3, $4, $5) on conflict (uri) do nothing`,
        [p.uri, p.author, iso(p.indexedAt), p.isReply, p.langs],
      )
      known.add(p.uri)
      if (p.replyParent && known.has(p.replyParent)) {
        await this.addInteractionRow(
          p.uri,
          'reply',
          p.replyParent,
          p.author,
          p.indexedAt,
        )
      }
    },

    /** Resposta a um post indexado, mesmo que a resposta em si não entre no feed (outro idioma). */
    async addReply(uri: string, parent: string, actor: string, at: number) {
      if (known.has(parent))
        await this.addInteractionRow(uri, 'reply', parent, actor, at)
    },

    async addInteraction(i: IndexedInteraction) {
      if (!known.has(i.subject)) return
      await this.addInteractionRow(
        i.uri,
        i.kind,
        i.subject,
        i.actor,
        i.createdAt,
      )
    },

    async addInteractionRow(
      uri: string,
      kind: string,
      subject: string,
      actor: string,
      at: number,
    ) {
      try {
        await db.query(
          `insert into interactions (uri, kind, subject_uri, actor_did, created_at)
           values ($1, $2, $3, $4, $5) on conflict (uri) do nothing`,
          [uri, kind, subject, actor, iso(at)],
        )
      } catch {
        // O post pode ter sido podado entre o teste do Set e o insert (FK). Ignorar.
      }
    },

    /** Apaga um registro (post, like ou repost); apagar o post apaga suas interações. */
    async deleteRecord(uri: string) {
      if (known.delete(uri))
        await db.query('delete from posts where uri = $1', [uri])
      await db.query('delete from interactions where uri = $1', [uri])
    },

    async prune(
      now: number,
      retentionHours: number,
      snapshotTtlMinutes: number,
    ) {
      const cutoff = iso(now - retentionHours * 3_600_000)
      const gone = await db.query<{uri: string}>(
        'delete from posts where indexed_at < $1 returning uri',
        [cutoff],
      )
      for (const r of gone) known.delete(r.uri)
      await db.query('delete from interactions where created_at < $1', [cutoff])
      await db.query('delete from hot_snapshots where id < $1', [
        now - snapshotTtlMinutes * 60_000,
      ])
      return gone.length
    },

    async candidates(
      now: number,
      retentionHours: number,
    ): Promise<Candidate[]> {
      // Interações do próprio autor (curtir o próprio post) não contam.
      const rows = await db.query(
        `select p.uri, p.author_did, p.indexed_at,
                count(i.uri) filter (where i.kind = 'like')::int as likes,
                count(i.uri) filter (where i.kind = 'repost')::int as reposts,
                count(i.uri) filter (where i.kind = 'reply')::int as replies
           from posts p
           left join interactions i on i.subject_uri = p.uri and i.actor_did <> p.author_did
          where not p.is_reply and p.indexed_at >= $1
          group by p.uri, p.author_did, p.indexed_at`,
        [iso(now - retentionHours * 3_600_000)],
      )
      return rows.map(r => ({
        uri: r.uri,
        author: r.author_did,
        indexedAt: new Date(r.indexed_at).getTime(),
        likes: Number(r.likes),
        reposts: Number(r.reposts),
        replies: Number(r.replies),
      }))
    },

    /** Calcula e grava um snapshot do ranking. Devolve o id (ms). */
    async refreshSnapshot(
      now: number,
      retentionHours: number,
      rank: Partial<RankOptions>,
    ) {
      const ranked = rankHot(
        await this.candidates(now, retentionHours),
        now,
        rank,
      )
      let id = now
      await db.transaction(async tx => {
        // ids únicos e crescentes mesmo com dois refreshes no mesmo ms
        const [last] = await tx.query<{id: string}>(
          'select max(id) as id from hot_snapshots',
        )
        if (last?.id && Number(last.id) >= id) id = Number(last.id) + 1
        await tx.query('insert into hot_snapshots (id, size) values ($1, $2)', [
          id,
          ranked.length,
        ])
        for (let i = 0; i < ranked.length; i += 500) {
          const chunk = ranked.slice(i, i + 500)
          const values = chunk
            .map((_, j) => `($1, $${j * 2 + 2}, $${j * 2 + 3})`)
            .join(', ')
          await tx.query(
            `insert into hot_ranks (snapshot_id, rank, uri) values ${values}`,
            [id, ...chunk.flatMap((r, j) => [i + j, r.uri])],
          )
        }
      })
      return id
    },

    async latestSnapshot(): Promise<number | undefined> {
      const [r] = await db.query<{id: string | null}>(
        'select max(id) as id from hot_snapshots',
      )
      return r?.id ? Number(r.id) : undefined
    },

    async snapshotExists(id: number) {
      return (
        (await db.query('select 1 from hot_snapshots where id = $1', [id]))
          .length > 0
      )
    },

    async page(snapshot: number, offset: number, limit: number) {
      const rows = await db.query<{uri: string}>(
        'select uri from hot_ranks where snapshot_id = $1 and rank >= $2 order by rank limit $3',
        [snapshot, offset, limit],
      )
      return rows.map(r => r.uri)
    },

    async getCursor(service: string) {
      const [r] = await db.query<{cursor: string}>(
        'select cursor from cursor_state where service = $1',
        [service],
      )
      return r ? Number(r.cursor) : undefined
    },

    async setCursor(service: string, cursor: number) {
      await db.query(
        `insert into cursor_state (service, cursor) values ($1, $2)
         on conflict (service) do update set cursor = excluded.cursor, updated_at = now()`,
        [service, cursor],
      )
    },
  }
}

export type Store = ReturnType<typeof createStore>
