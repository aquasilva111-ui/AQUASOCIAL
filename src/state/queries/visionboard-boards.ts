import {type AppBskyFeedDefs} from '@atproto/api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {uploadBlob} from '#/lib/api'
import {POST_IMG_MAX} from '#/lib/constants'
import {compressIfNeeded} from '#/lib/media/manip'
import {type PickerImage} from '#/lib/media/picker.shared'
import {type Aesthetic} from '#/lib/visionboard/aesthetics'
import {
  BOARD_COLLECTION,
  type BoardRecord,
  newPinRecord,
  normalizeBoard,
  normalizePin,
  PIN_COLLECTION,
  pinKey,
  type PinRecord,
  type PinSubject,
  rkeyOf,
  type StoredPin,
  toWritable,
  visibleBoards,
} from '#/lib/visionboard/boards'
import {
  newUploadRecord,
  normalizeUpload,
  type StoredUpload,
  UPLOAD_COLLECTION,
} from '#/lib/visionboard/uploads'
import {ensurePdsEndpoint} from '#/state/queries/stories'
import {useAgent, useSession} from '#/state/session'

const ROOT = 'visionboard-boards'
export const RQKEY = {
  boards: (did: string) => [ROOT, 'boards', did],
  pins: (did: string) => [ROOT, 'pins', did],
}

export type StoredBoard = {
  uri: string
  rkey: string
  did: string
  board: BoardRecord
}

/** All records of a collection in one repo, following the cursor. */
async function listAll(
  agent: ReturnType<typeof useAgent>,
  did: string,
  collection: string,
  maxPages = 10,
) {
  const out: {uri: string; value: unknown}[] = []
  let cursor: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const {data} = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection,
      limit: 100,
      cursor,
    })
    out.push(...data.records)
    cursor = data.cursor
    if (!cursor) break
  }
  return out
}

/** Folders of an author. Non-owners never get private folders. */
export function useBoardsQuery(did: string | undefined) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const isOwner = !!did && currentAccount?.did === did
  return useQuery<StoredBoard[]>({
    queryKey: [...RQKEY.boards(did ?? ''), isOwner],
    enabled: !!did,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did) return []
      const records = await listAll(agent, did, BOARD_COLLECTION)
      const boards = records
        .map(r => ({r, board: normalizeBoard(r.value)}))
        .filter((x): x is {r: typeof x.r; board: BoardRecord} => !!x.board)
        .map(({r, board}) => ({uri: r.uri, rkey: rkeyOf(r.uri), did, board}))
        .sort((a, b) => b.board.updatedAt.localeCompare(a.board.updatedAt))
      return visibleBoards(boards, isOwner)
    },
  })
}

/** One folder by rkey; undefined when missing, private for a stranger, or invalid. */
export function useBoardQuery(did: string | undefined, rkey: string) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  const isOwner = !!did && currentAccount?.did === did
  return useQuery<StoredBoard | undefined>({
    queryKey: [...RQKEY.boards(did ?? ''), 'one', rkey, isOwner],
    enabled: !!did,
    staleTime: 30_000,
    queryFn: async () => {
      if (!did) return undefined
      try {
        const {data} = await agent.com.atproto.repo.getRecord({
          repo: did,
          collection: BOARD_COLLECTION,
          rkey,
        })
        const board = normalizeBoard(data.value)
        if (!board) return undefined
        const stored = {uri: data.uri, rkey, did, board}
        return visibleBoards([stored], isOwner)[0]
      } catch {
        return undefined
      }
    },
  })
}

/** The AQUA posts behind a set of pins, 25 per request (getPosts' limit). */
export function usePinPostsQuery(uris: string[]) {
  const agent = useAgent()
  const unique = [...new Set(uris)].sort()
  return useQuery<Map<string, AppBskyFeedDefs.PostView>>({
    queryKey: [ROOT, 'posts', unique.join(',')],
    enabled: unique.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out = new Map<string, AppBskyFeedDefs.PostView>()
      for (let i = 0; i < unique.length; i += 25) {
        const {data} = await agent.app.bsky.feed.getPosts({
          uris: unique.slice(i, i + 25),
        })
        for (const post of data.posts) out.set(post.uri, post)
      }
      return out
    },
  })
}

/**
 * Every pin of an author in ONE query, grouped by folder. One round trip
 * instead of one per board, and it is what duplicate checks and "saved in…"
 * need anyway.
 */
export function usePinsByBoardQuery(did: string | undefined) {
  const agent = useAgent()
  return useQuery<Map<string, StoredPin[]>>({
    queryKey: RQKEY.pins(did ?? ''),
    enabled: !!did,
    staleTime: 30_000,
    queryFn: async () => {
      const by = new Map<string, StoredPin[]>()
      if (!did) return by
      const records = await listAll(agent, did, PIN_COLLECTION, 30)
      for (const r of records) {
        const pin = normalizePin(r.value, did)
        if (!pin) continue
        const list = by.get(pin.board) ?? []
        list.push({uri: r.uri, rkey: rkeyOf(r.uri), pin})
        by.set(pin.board, list)
      }
      return by
    },
  })
}

function useOwnDid() {
  const {currentAccount} = useSession()
  return () => {
    if (!currentAccount) throw new Error('not_signed_in')
    return currentAccount.did
  }
}

/** Creates a folder (no rkey → PDS assigns a TID) or updates it in place. */
export function useSaveBoardMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {rkey?: string; draft: BoardRecord}) => {
      const repo = ownDid()
      const record = toWritable(input.draft)
      if (input.rkey) {
        await agent.com.atproto.repo.putRecord({
          repo,
          collection: BOARD_COLLECTION,
          rkey: input.rkey,
          record: record as unknown as Record<string, unknown>,
        })
        return {uri: `at://${repo}/${BOARD_COLLECTION}/${input.rkey}`}
      }
      const {data} = await agent.com.atproto.repo.createRecord({
        repo,
        collection: BOARD_COLLECTION,
        record: record as unknown as Record<string, unknown>,
      })
      return {uri: data.uri}
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

export function useDeleteBoardMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      rkey: string
      pinRkeys: string[]
      uploadRkeys?: string[]
    }) => {
      const repo = ownDid()
      for (const rkey of input.uploadRkeys ?? []) {
        await agent.com.atproto.repo.deleteRecord({
          repo,
          collection: UPLOAD_COLLECTION,
          rkey,
        })
      }
      // Pins first so a failure never leaves pins pointing at a missing folder.
      for (const rkey of input.pinRkeys) {
        await agent.com.atproto.repo.deleteRecord({
          repo,
          collection: PIN_COLLECTION,
          rkey,
        })
      }
      await agent.com.atproto.repo.deleteRecord({
        repo,
        collection: BOARD_COLLECTION,
        rkey: input.rkey,
      })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

export type AddPinInput = {
  boardUri: string
  subject: PinSubject
  imageIndex: number
  aesthetic?: Aesthetic
  tags: string[]
  note?: string
}

/** Puts one image in a folder. Refuses the same image twice in the same folder. */
export function useAddPinMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddPinInput) => {
      const repo = ownDid()
      const cached = qc.getQueryData<Map<string, StoredPin[]>>(RQKEY.pins(repo))
      const key = pinKey(input.subject, input.imageIndex)
      if (
        cached
          ?.get(input.boardUri)
          ?.some(p => pinKey(p.pin.subject, p.pin.imageIndex) === key)
      ) {
        throw new Error('already_pinned')
      }
      const record = toWritable(
        newPinRecord({
          board: input.boardUri,
          subject: input.subject,
          imageIndex: input.imageIndex,
          aesthetic: input.aesthetic,
          tags: input.tags,
          note: input.note,
        }),
      )
      const {data} = await agent.com.atproto.repo.createRecord({
        repo,
        collection: PIN_COLLECTION,
        record: record as unknown as Record<string, unknown>,
      })
      return {uri: data.uri}
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

export function useRemovePinMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {rkey: string}) => {
      await agent.com.atproto.repo.deleteRecord({
        repo: ownDid(),
        collection: PIN_COLLECTION,
        rkey: input.rkey,
      })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

/** Moves a pin to another folder by rewriting its `board`; the manual order resets. */
export function useMovePinMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {stored: StoredPin; toBoardUri: string}) => {
      const moved: PinRecord = {
        ...input.stored.pin,
        board: input.toBoardUri,
        position: undefined,
      }
      await agent.com.atproto.repo.putRecord({
        repo: ownDid(),
        collection: PIN_COLLECTION,
        rkey: input.stored.rkey,
        record: toWritable(moved) as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

/** Saves a manual order. Only pins whose position actually changes are written. */
export function useReorderPinsMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {ordered: StoredPin[]}) => {
      const repo = ownDid()
      for (const [index, stored] of input.ordered.entries()) {
        if (stored.pin.position === index) continue
        await agent.com.atproto.repo.putRecord({
          repo,
          collection: PIN_COLLECTION,
          rkey: stored.rkey,
          record: toWritable({
            ...stored.pin,
            position: index,
          }) as unknown as Record<string, unknown>,
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

/** Images dropped into boards, grouped by board (one query per author). */
export function useUploadsByBoardQuery(did: string | undefined) {
  const agent = useAgent()
  return useQuery<Map<string, StoredUpload[]>>({
    queryKey: [ROOT, 'uploads', did ?? ''],
    enabled: !!did,
    staleTime: 30_000,
    queryFn: async () => {
      const by = new Map<string, StoredUpload[]>()
      if (!did) return by
      const records = await listAll(agent, did, UPLOAD_COLLECTION, 30)
      for (const r of records) {
        const upload = normalizeUpload(r.value, did)
        if (!upload) continue
        const list = by.get(upload.board) ?? []
        list.push({uri: r.uri, rkey: rkeyOf(r.uri), upload})
        by.set(upload.board, list)
      }
      for (const list of by.values()) {
        list.sort((a, b) =>
          b.upload.createdAt.localeCompare(a.upload.createdAt),
        )
      }
      return by
    },
  })
}

/** Where a repo's blobs are served from (its PDS), cached for an hour. */
export function usePdsEndpointQuery(did: string | undefined) {
  const agent = useAgent()
  const qc = useQueryClient()
  return useQuery<string | null>({
    queryKey: ['pds-endpoint', did ?? ''],
    enabled: !!did,
    staleTime: 60 * 60 * 1000,
    queryFn: () => ensurePdsEndpoint(agent, qc, did!),
  })
}

export type UploadOutcome = {name: string; error?: string}

/**
 * Uploads images from the user's device into a board, one after the other
 * (a failure never blocks the rest). Each image is compressed to the same
 * size limit as post images, stored as a blob and referenced by an upload
 * record; no post is created.
 */
export function useUploadImagesMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      boardUri: string
      images: {name: string; image: PickerImage}[]
      onProgress?: (done: number, total: number) => void
    }): Promise<UploadOutcome[]> => {
      const repo = ownDid()
      const outcomes: UploadOutcome[] = []
      for (const [i, {name, image}] of input.images.entries()) {
        try {
          const compressed = await compressIfNeeded(image, POST_IMG_MAX.size)
          const {data} = await uploadBlob(
            agent,
            compressed.path,
            compressed.mime,
          )
          const record = toWritable(
            newUploadRecord({
              board: input.boardUri,
              image: data.blob as never,
              aspectRatio: {width: compressed.width, height: compressed.height},
            }) as never,
          )
          await agent.com.atproto.repo.createRecord({
            repo,
            collection: UPLOAD_COLLECTION,
            record: record as unknown as Record<string, unknown>,
          })
          outcomes.push({name})
        } catch (e) {
          outcomes.push({name, error: e instanceof Error ? e.message : 'erro'})
        }
        input.onProgress?.(i + 1, input.images.length)
      }
      return outcomes
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}

export function useRemoveUploadMutation() {
  const agent = useAgent()
  const ownDid = useOwnDid()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {rkey: string}) => {
      await agent.com.atproto.repo.deleteRecord({
        repo: ownDid(),
        collection: UPLOAD_COLLECTION,
        rkey: input.rkey,
      })
    },
    onSuccess: () => qc.invalidateQueries({queryKey: [ROOT]}),
  })
}
