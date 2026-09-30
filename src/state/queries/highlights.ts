import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  getPdsEndpoint,
  HIGHLIGHT_COLLECTION,
  type HighlightView,
  newHighlightRecord,
  normalizeHighlight,
  type StoryView,
  validateHighlightDraft,
} from '#/lib/stories/model'
import {useAgent, useSession} from '#/state/session'

const RQKEY_ROOT = 'story-highlights'
export const RQKEY = (did: string) => [RQKEY_ROOT, did]

/**
 * Highlights are self-published records (place.aqua.actor.highlight) read
 * via com.atproto.repo.listRecords. Each item embeds the story's blob ref,
 * which keeps the media alive after the 24h story itself has expired.
 */
export function useHighlightsQuery(did: string | undefined) {
  const agent = useAgent()
  return useQuery<HighlightView[]>({
    queryKey: RQKEY(did ?? ''),
    enabled: !!did,
    staleTime: 60_000,
    queryFn: async () => {
      if (!did) return []
      const [res, repoDesc] = await Promise.all([
        agent.com.atproto.repo
          .listRecords({repo: did, collection: HIGHLIGHT_COLLECTION, limit: 50})
          .catch(() => undefined),
        agent.com.atproto.repo.describeRepo({repo: did}).catch(() => undefined),
      ])
      if (!res) return []
      const pdsUrl = repoDesc && getPdsEndpoint(repoDesc.data.didDoc)
      if (!pdsUrl) return []
      const views: HighlightView[] = []
      for (const rec of res.data.records) {
        const view = normalizeHighlight(rec, {did, pdsUrl})
        if (view) views.push(view)
      }
      return views.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
  })
}

function useInvalidateOwn() {
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()
  return () => {
    if (!currentAccount) return
    queryClient.invalidateQueries({queryKey: RQKEY(currentAccount.did)})
  }
}

export function useCreateHighlightMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const invalidate = useInvalidateOwn()

  return useMutation({
    mutationFn: async ({
      title,
      stories,
    }: {
      title: string
      stories: StoryView[]
    }) => {
      if (!currentAccount) throw new Error('Not logged in')
      if (validateHighlightDraft(title, stories.length)) {
        throw new Error('Invalid highlight')
      }
      await agent.com.atproto.repo.createRecord({
        repo: currentAccount.did,
        collection: HIGHLIGHT_COLLECTION,
        record: newHighlightRecord(title, stories) as unknown as Record<
          string,
          unknown
        >,
      })
    },
    onSuccess: invalidate,
  })
}

export function useUpdateHighlightMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const invalidate = useInvalidateOwn()

  return useMutation({
    mutationFn: async ({
      highlight,
      title,
      stories,
    }: {
      highlight: HighlightView
      title: string
      stories: StoryView[]
    }) => {
      if (!currentAccount) throw new Error('Not logged in')
      if (validateHighlightDraft(title, stories.length)) {
        throw new Error('Invalid highlight')
      }
      const created = new Date(highlight.createdAt)
      await agent.com.atproto.repo.putRecord({
        repo: currentAccount.did,
        collection: HIGHLIGHT_COLLECTION,
        rkey: highlight.rkey,
        record: newHighlightRecord(
          title,
          stories,
          Number.isNaN(created.getTime()) ? new Date() : created,
        ) as unknown as Record<string, unknown>,
      })
    },
    onSuccess: invalidate,
  })
}

export function useDeleteHighlightMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const invalidate = useInvalidateOwn()

  return useMutation({
    mutationFn: async (rkey: string) => {
      if (!currentAccount) throw new Error('Not logged in')
      await agent.com.atproto.repo.deleteRecord({
        repo: currentAccount.did,
        collection: HIGHLIGHT_COLLECTION,
        rkey,
      })
    },
    onSuccess: invalidate,
  })
}
