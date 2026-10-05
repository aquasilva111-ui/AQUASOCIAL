import {type BlobRef, type BskyAgent} from '@atproto/api'
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {compressIfNeeded} from '#/lib/media/manip'
import {type PickerImage} from '#/lib/media/picker.shared'
import {
  getPdsEndpoint,
  isExpired,
  isHexColor,
  normalizeOverlays,
  normalizeStory,
  STORY_COLLECTION,
  type StoryFit,
  type StoryOverlay,
  type StoryView,
  validateStoryDraft,
} from '#/lib/stories/model'
import {useAgent, useSession} from '#/state/session'

export type {StoryView} from '#/lib/stories/model'
export {STORY_COLLECTION, STORY_TTL_MS} from '#/lib/stories/model'

export interface StoryRecord {
  $type: string
  createdAt: string
  media?: BlobRef
  aspectRatio?: {width: number; height: number}
  fit?: StoryFit
  background?: string
  overlays?: StoryOverlay[]
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
  const queryClient = useQueryClient()
  return useQuery<StoryView[]>({
    queryKey: RQKEY(did ?? '', includeExpired),
    enabled: !!did,
    staleTime: 30_000,
    refetchInterval: includeExpired ? false : 60_000,
    queryFn: () =>
      did ? fetchStories(agent, queryClient, did, includeExpired) : [],
  })
}

/** A repo's PDS rarely changes, so it is cached for an hour per DID. */
export function ensurePdsEndpoint(
  agent: BskyAgent,
  queryClient: QueryClient,
  did: string,
) {
  return queryClient.ensureQueryData({
    queryKey: ['pds-endpoint', did],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const desc = await agent.com.atproto.repo.describeRepo({repo: did})
      return getPdsEndpoint(desc.data.didDoc) ?? null
    },
  })
}

/** Shared by the profile row and the home tray (same cache key). */
export async function fetchStories(
  agent: BskyAgent,
  queryClient: QueryClient,
  did: string,
  includeExpired = false,
): Promise<StoryView[]> {
  const [res, pdsUrl] = await Promise.all([
    agent.com.atproto.repo
      .listRecords({repo: did, collection: STORY_COLLECTION, limit: 100})
      .catch(() => undefined),
    ensurePdsEndpoint(agent, queryClient, did).catch(() => null),
  ])
  if (!res || !pdsUrl) return []
  const views: StoryView[] = []
  for (const rec of res.data.records) {
    const view = normalizeStory(rec, {did, pdsUrl})
    if (!view) continue
    if (!includeExpired && isExpired(view.createdAt)) continue
    views.push(view)
  }
  return views.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export type NewStoryInput = {
  /** A photo story. Omit for a text-only story on a colour. */
  image?: PickerImage
  background?: string
  overlays: StoryOverlay[]
}

export function useCreateStoryMutation() {
  const {currentAccount} = useSession()
  const agent = useAgent()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: PickerImage | NewStoryInput) => {
      if (!currentAccount) throw new Error('Not logged in')
      // A bare image is a plain photo story (older callers).
      const {image, background, overlays}: NewStoryInput =
        'path' in input ? {image: input, overlays: []} : input
      const clean = normalizeOverlays(overlays)
      if (
        validateStoryDraft({hasMedia: !!image, background, overlays: clean})
      ) {
        throw new Error('empty_story')
      }
      const record: StoryRecord = {
        $type: STORY_COLLECTION,
        createdAt: new Date().toISOString(),
        // The creator frames photos in the 9:16 canvas, so viewers crop alike.
        fit: 'cover',
        ...(clean.length ? {overlays: clean} : {}),
      }
      if (image) {
        const compressed = await compressIfNeeded(image)
        const {data} = await uploadBlob(agent, compressed.path, compressed.mime)
        record.media = data.blob
        record.aspectRatio = {
          width: compressed.width,
          height: compressed.height,
        }
      }
      if (isHexColor(background)) record.background = background
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
