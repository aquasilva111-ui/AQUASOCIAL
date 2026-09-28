import {type BlobRef} from '@atproto/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {compressIfNeeded} from '#/lib/media/manip'
import {type PickerImage} from '#/lib/media/picker.shared'
import {useAgent, useSession} from '#/state/session'

export const STORY_COLLECTION = 'place.aqua.actor.story'
export const STORY_TTL_MS = 24 * 60 * 60 * 1000

export interface StoryRecord {
  $type: string
  createdAt: string
  media: BlobRef
  aspectRatio?: {width: number; height: number}
}

/** Shape of the record as it comes back as raw JSON from listRecords. */
interface StoredStoryRecord {
  createdAt?: string
  media?: {ref?: {$link?: string}}
  aspectRatio?: {width: number; height: number}
}

export interface StoryView {
  uri: string
  rkey: string
  createdAt: string
  mediaUrl: string
  aspectRatio?: {width: number; height: number}
}

const RQKEY_ROOT = 'stories'
export const RQKEY = (did: string) => [RQKEY_ROOT, did]

function isExpired(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() > STORY_TTL_MS
}

/** Resolves a repo's PDS service endpoint from its DID document. */
function getPdsEndpoint(didDoc: unknown): string | undefined {
  if (!didDoc || typeof didDoc !== 'object') return undefined
  const services = (didDoc as {service?: unknown}).service
  if (!Array.isArray(services)) return undefined
  const pds = services.find(
    (svc): svc is {id: string; serviceEndpoint: string} =>
      !!svc &&
      typeof svc === 'object' &&
      (svc as {id?: string}).id === '#atproto_pds',
  )
  return pds?.serviceEndpoint
}

/**
 * Stories are a custom, self-published record (place.aqua.actor.story),
 * read for any profile via the generic com.atproto.repo.listRecords — no
 * AppView/indexer support required. Expiry (24h) is enforced client-side
 * by filtering here, plus best-effort cleanup of the viewer's own expired
 * stories (see useCleanupOwnExpiredStories).
 */
export function useStoriesQuery(did: string | undefined) {
  const agent = useAgent()
  return useQuery<StoryView[]>({
    queryKey: RQKEY(did ?? ''),
    enabled: !!did,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!did) return []
      const [res, repoDesc] = await Promise.all([
        agent.com.atproto.repo
          .listRecords({repo: did, collection: STORY_COLLECTION, limit: 30})
          .catch(() => undefined),
        agent.com.atproto.repo.describeRepo({repo: did}).catch(() => undefined),
      ])
      if (!res) return []
      const pdsUrl = repoDesc && getPdsEndpoint(repoDesc.data.didDoc)
      if (!pdsUrl) return []
      const views: StoryView[] = []
      for (const {uri, value} of res.data.records) {
        const record = value as unknown as StoredStoryRecord
        const cid = record.media?.ref?.$link
        if (!cid || !record.createdAt || isExpired(record.createdAt)) continue
        views.push({
          uri,
          rkey: uri.split('/').pop()!,
          createdAt: record.createdAt,
          aspectRatio: record.aspectRatio,
          mediaUrl: `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`,
        })
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
      queryClient.invalidateQueries({queryKey: RQKEY(currentAccount.did)})
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
      queryClient.invalidateQueries({queryKey: RQKEY(currentAccount.did)})
    },
  })
}
