import {type AppBskyFeedDefs} from '@atproto/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  addListItem,
  LIST_COLLECTIONS,
  listToRecord,
  newListRecord,
  normalizeList,
  removeListItem,
  type ViewListKind,
  type ViewListView,
  type ViewListVisibility,
} from '#/lib/view-library/model'
import {useAgent, useSession} from '#/state/session'

const ROOT = 'view-lists'
export const RQKEY = (did: string, kind: ViewListKind) => [ROOT, did, kind]

/**
 * Playlists and collections are self-published records read through the
 * generic com.atproto.repo API (same approach as stories and channels): no
 * indexer needed, only the owner can write.
 */
export function useViewListsQuery(did: string | undefined, kind: ViewListKind) {
  const agent = useAgent()
  return useQuery<ViewListView[]>({
    queryKey: RQKEY(did ?? '', kind),
    enabled: !!did,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did) return []
      const res = await agent.com.atproto.repo
        .listRecords({
          repo: did,
          collection: LIST_COLLECTIONS[kind],
          limit: 100,
        })
        .catch(() => undefined)
      if (!res) return []
      const lists: ViewListView[] = []
      for (const rec of res.data.records) {
        const view = normalizeList(kind, rec)
        if (view) lists.push(view)
      }
      return lists.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
  })
}

export function useViewListQuery(
  did: string | undefined,
  kind: ViewListKind,
  rkey: string | undefined,
) {
  const agent = useAgent()
  return useQuery<ViewListView | null>({
    queryKey: [ROOT, did ?? '', kind, rkey ?? ''],
    enabled: !!did && !!rkey,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did || !rkey) return null
      const res = await agent.com.atproto.repo
        .getRecord({repo: did, collection: LIST_COLLECTIONS[kind], rkey})
        .catch(() => undefined)
      if (!res) return null
      return (
        normalizeList(kind, {uri: res.data.uri, value: res.data.value}) ?? null
      )
    },
  })
}

/** Resolves list item URIs to posts (25 per call), keeping list order. */
export function useListPostsQuery(uris: string[]) {
  const agent = useAgent()
  return useQuery<AppBskyFeedDefs.PostView[]>({
    queryKey: [ROOT, 'posts', uris],
    enabled: uris.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const chunks: string[][] = []
      for (let i = 0; i < uris.length; i += 25)
        chunks.push(uris.slice(i, i + 25))
      const byUri = new Map<string, AppBskyFeedDefs.PostView>()
      const results = await Promise.all(
        chunks.map(chunk =>
          agent.getPosts({uris: chunk}).catch(() => undefined),
        ),
      )
      for (const r of results)
        for (const p of r?.data.posts ?? []) byUri.set(p.uri, p)
      return uris.flatMap(u => {
        const p = byUri.get(u)
        return p ? [p] : []
      })
    },
  })
}

function useOwn() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()
  const did = currentAccount?.did
  const invalidate = () => {
    if (did) queryClient.invalidateQueries({queryKey: [ROOT, did]})
  }
  return {did, agent, invalidate}
}

export function useCreateViewListMutation(kind: ViewListKind) {
  const {did, agent, invalidate} = useOwn()
  return useMutation({
    mutationFn: async (draft: {
      title: string
      description?: string
      visibility: ViewListVisibility
      firstItemUri?: string
    }) => {
      if (!did) throw new Error('not_signed_in')
      if (!draft.title.trim()) throw new Error('title_required')
      const items = draft.firstItemUri
        ? addListItem([], draft.firstItemUri)
        : []
      const res = await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: LIST_COLLECTIONS[kind],
        record: newListRecord(kind, {...draft, items}) as unknown as Record<
          string,
          unknown
        >,
      })
      return res.data.uri
    },
    onSuccess: invalidate,
  })
}

export function useUpdateViewListMutation() {
  const {did, agent, invalidate} = useOwn()
  return useMutation({
    mutationFn: async ({
      list,
      patch,
    }: {
      list: ViewListView
      patch: Parameters<typeof listToRecord>[1]
    }) => {
      if (!did) throw new Error('not_signed_in')
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: LIST_COLLECTIONS[list.kind],
        rkey: list.rkey,
        record: listToRecord(list, patch) as unknown as Record<string, unknown>,
      })
    },
    onSuccess: invalidate,
  })
}

export function useToggleListItemMutation() {
  const update = useUpdateViewListMutation()
  return useMutation({
    mutationFn: async ({list, uri}: {list: ViewListView; uri: string}) => {
      const has = list.items.some(i => i.uri === uri)
      await update.mutateAsync({
        list,
        patch: {
          items: has
            ? removeListItem(list.items, uri)
            : addListItem(list.items, uri),
        },
      })
    },
  })
}

export function useDeleteViewListMutation() {
  const {did, agent, invalidate} = useOwn()
  return useMutation({
    mutationFn: async (list: ViewListView) => {
      if (!did) throw new Error('not_signed_in')
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: LIST_COLLECTIONS[list.kind],
        rkey: list.rkey,
      })
    },
    onSuccess: invalidate,
  })
}
