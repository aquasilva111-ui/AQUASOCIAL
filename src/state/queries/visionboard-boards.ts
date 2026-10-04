import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

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
    mutationFn: async (input: {rkey: string; pinRkeys: string[]}) => {
      const repo = ownDid()
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
