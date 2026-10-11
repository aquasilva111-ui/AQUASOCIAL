// app.bsky.feed.getFeedSkeleton: ranking congelado em snapshots + cursor.
import type {Config} from './config.ts'
import {decodeCursor, encodeCursor} from './cursor.ts'
import type {Store} from './store.ts'

export class BadCursorError extends Error {}

export function createFeed(
  store: Store,
  cfg: Config,
  clock: () => number = Date.now,
) {
  let refreshing: Promise<number> | undefined

  const rank = {
    maxPerAuthor: cfg.maxPerAuthor,
    minEngagement: cfg.minEngagement,
    limit: cfg.snapshotSize,
  }

  /** Recalcula o ranking (um por vez, mesmo com pedidos simultâneos). */
  function refresh(): Promise<number> {
    refreshing ??= store
      .refreshSnapshot(clock(), cfg.retentionHours, rank)
      .finally(() => {
        refreshing = undefined
      })
    return refreshing
  }

  /** Snapshot atual; recalcula se não houver ou se estiver velho. */
  async function current(): Promise<number> {
    const latest = await store.latestSnapshot()
    if (latest === undefined || clock() - latest > cfg.refreshSeconds * 1000)
      return refresh()
    return latest
  }

  async function skeleton(params: {cursor?: string; limit?: number}) {
    const limit = Math.min(
      100,
      Math.max(1, Math.floor(params.limit ?? 30) || 30),
    )
    let snapshot: number
    let offset = 0
    if (params.cursor) {
      const c = decodeCursor(params.cursor)
      if (!c) throw new BadCursorError('Cursor inválido')
      // Snapshot apagado (mais velho que o TTL): fim da lista, o app recarrega do topo.
      if (!(await store.snapshotExists(c.snapshot))) return {feed: []}
      snapshot = c.snapshot
      offset = c.offset
    } else {
      snapshot = await current()
    }
    const uris = await store.page(snapshot, offset, limit + 1)
    const more = uris.length > limit
    return {
      feed: uris.slice(0, limit).map(post => ({post})),
      cursor: more
        ? encodeCursor({snapshot, offset: offset + limit})
        : undefined,
    }
  }

  return {refresh, current, skeleton}
}

export type Feed = ReturnType<typeof createFeed>
