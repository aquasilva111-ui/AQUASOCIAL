import {type BlobRef} from '@atproto/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {compressIfNeeded} from '#/lib/media/manip'
import {type PickerImage} from '#/lib/media/picker.shared'
import {
  getPdsEndpoint,
  isExpired,
  normalizeStory,
  STORY_COLLECTION,
  type StoryView,
} from '#/lib/stories/model'
import {useAgent, useSession} from '#/state/session'

export type {StoryView} from '#/lib/stories/model'
export {STORY_COLLECTION, STORY_TTL_MS} from '#/lib/stories/model'

export interface StoryRecord {
  $type: string
  createdAt: string
  media: BlobRef
  aspectRatio?: {width: number; height: number}
}

const RQKEY_ROOT = 'stories'
export const RQKEY = (did: string, includeExpired = false) => [
  RQKEY_ROOT,
  did,
  includeExpired,
]

/**
 * Stories are a custom, self-published record (place.aqua.actor.story),
 * read for any profile via the generic com.atproto.repo.listRecords — no
 * AppView/indexer support required. Expiry (24h) is enforced client-side
 * by filtering here. Expired records are never deleted, so the owner can
 * still pick them (includeExpired) when building a highlight.
 */
export function useStoriesQuery(
  did: string | undefined,
  {includeExpired = false}: {includeExpired?: boolean} = {},
) {
  const agent = useAgent()
  return useQuery<StoryView[]>({
    queryKey: RQKEY(did ?? '', includeExpired),
    enabled: !!did,
    staleTime: 30_000,
    refetchInterval: includeExpired ? false : 60_000,
    queryFn: async () => {
      if (!did) return []
      const [res, repoDesc] = await Promise.all([
        agent.com.atproto.repo
          .listRecords({repo: did, collection: STORY_COLLECTION, limit: 100})
          .catch(() => undefined),
        agent.com.atproto.repo.describeRepo({repo: did}).catch(() => undefined),
      ])
      if (!res) return []
      const pdsUrl = repoDesc && getPdsEndpoint(repoDesc.data.didDoc)
      if (!pdsUrl) return []
      const views: StoryView[] = []
      for (const rec of res.data.records) {
        const view = normalizeStory(rec, {did, pdsUrl})
        if (!view) continue
        if (!includeExpired && isExpired(view.createdAt)) continue
        views.push(view)
      }
      return views.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
  })
}

export function useCreateStoryMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (image: PickerImage) => {
      if (!currentAccount) throw new Error('Not logged in')
      const compressed = await compressIfNeeded(image)
      const {data} = await uploadBlob(agent, compressed.path, compressed.mime)
      const record: StoryRecord = {
        $type: STORY_COLLECTION,
        createdAt: new Date().toISOString(),
        media: data.blob,
        aspectRatio: {width: compressed.width, height: compressed.height},
      }
      await agent.com.atproto.repo.createRecord({
        repo: currentAccount.did,
        collection: STORY_COLLECTION,
        record: record as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      if (!currentAccount) return
      queryClient.invalidateQueries({
        queryKey: [RQKEY_ROOT, currentAccount.did],
      })
    },
  })
}

export function useDeleteStoryMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rkey: string) => {
      if (!currentAccount) throw new Error('Not logged in')
      await agent.com.atproto.repo.deleteRecord({
        repo: currentAccount.did,
        collection: STORY_COLLECTION,
        rkey,
      })
    },
    onSuccess: () => {
      if (!currentAccount) return
      queryClient.invalidateQueries({
        queryKey: [RQKEY_ROOT, currentAccount.did],
      })
    },
  })
}
