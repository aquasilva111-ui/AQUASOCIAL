import {type Aesthetic, normalizeAesthetic} from '#/lib/visionboard/aesthetics'

/**
 * Visionboard folders live in the user's own PDS repo, like Books:
 *   board: the folder (name, description, visibility)
 *   pin:   one image of one AQUA post placed in a folder
 * A pin never copies the image, it points at the post (uri + cid) and carries
 * the aesthetic signature computed once at save time, so no pixels are
 * needed to rank or group pins later. Moving a pin is rewriting its `board`.
 */
export const BOARD_COLLECTION = 'place.aqua.visionboard.board'
export const PIN_COLLECTION = 'place.aqua.visionboard.pin'

export type BoardVisibility = 'public' | 'private'

export type BoardRecord = {
  $type: typeof BOARD_COLLECTION
  title: string
  description?: string
  /** "private" hides the board in AQUA; the record itself stays public repo data. */
  visibility: BoardVisibility
  /** Pin whose image is the cover. Defaults to the most recent pin. */
  coverPin?: string
  createdAt: string
  updatedAt: string
}

export type PinSubject = {uri: string; cid: string}

export type PinRecord = {
  $type: typeof PIN_COLLECTION
  /** at:// URI of the board, always in the same repo as the pin. */
  board: string
  subject: PinSubject
  /** Which image of a gallery post. */
  imageIndex: number
  aesthetic?: Aesthetic
  tags: string[]
  note?: string
  /** Manual order inside the board; absent means "by date". */
  position?: number
  createdAt: string
}

export const LIMITS = {
  title: 60,
  description: 300,
  note: 300,
  tags: 8,
  tag: 32,
}

const VISIBILITIES = new Set<BoardVisibility>(['public', 'private'])

const clampText = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

export function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1)
}

export function isBoardUri(uri: unknown, did?: string): uri is string {
  if (typeof uri !== 'string') return false
  const m = uri.match(
    /^at:\/\/([^/]+)\/place\.aqua\.visionboard\.board\/[^/]+$/,
  )
  return !!m && (!did || m[1] === did)
}

function isPostUri(uri: unknown): uri is string {
  return (
    typeof uri === 'string' &&
    /^at:\/\/[^/]+\/app\.bsky\.feed\.post\/[^/]+$/.test(uri)
  )
}

/** One image of one post, the identity used to avoid pinning the same image twice. */
export function pinKey(subject: PinSubject, imageIndex: number): string {
  return `${subject.uri}#${imageIndex}`
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [
    ...new Set(
      raw
        .filter((t): t is string => typeof t === 'string')
        .map(t =>
          t
            .toLowerCase()
            .replace(/^#/, '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim()
            .slice(0, LIMITS.tag),
        )
        .filter(Boolean),
    ),
  ].slice(0, LIMITS.tags)
}

export function newBoardRecord(
  input: Partial<BoardRecord> & {title: string},
  now = new Date(),
): BoardRecord {
  const ts = now.toISOString()
  return {
    $type: BOARD_COLLECTION,
    visibility: 'public',
    createdAt: ts,
    updatedAt: ts,
    ...input,
  }
}

export function newPinRecord(
  input: Partial<PinRecord> & {board: string; subject: PinSubject},
  now = new Date(),
): PinRecord {
  return {
    $type: PIN_COLLECTION,
    imageIndex: 0,
    tags: [],
    createdAt: now.toISOString(),
    ...input,
  }
}

/** Repo data is public and writable by any client: validate every field. */
export function normalizeBoard(raw: unknown): BoardRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, any>
  const title = clampText(r.title, LIMITS.title)
  if (!title) return undefined
  return {
    $type: BOARD_COLLECTION,
    title,
    description: clampText(r.description, LIMITS.description),
    visibility: VISIBILITIES.has(r.visibility) ? r.visibility : 'public',
    coverPin: typeof r.coverPin === 'string' ? r.coverPin : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
  }
}

export function normalizePin(
  raw: unknown,
  ownerDid: string,
): PinRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, any>
  // A pin can only live in a board of the same author.
  if (!isBoardUri(r.board, ownerDid)) return undefined
  if (!isPostUri(r.subject?.uri) || typeof r.subject?.cid !== 'string')
    return undefined
  const imageIndex = Number(r.imageIndex)
  return {
    $type: PIN_COLLECTION,
    board: r.board,
    subject: {uri: r.subject.uri, cid: r.subject.cid},
    imageIndex:
      Number.isInteger(imageIndex) && imageIndex >= 0 && imageIndex < 4
        ? imageIndex
        : 0,
    aesthetic: normalizeAesthetic(r.aesthetic),
    tags: normalizeTags(r.tags),
    note: clampText(r.note, LIMITS.note),
    position:
      typeof r.position === 'number' && Number.isFinite(r.position)
        ? r.position
        : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
  }
}

/** Ready to write: timestamps set, undefined/empty fields dropped. */
export function toWritable<T extends BoardRecord | PinRecord>(
  draft: T,
  now = new Date(),
): T {
  const ts = now.toISOString()
  const stamped: Record<string, unknown> = {
    ...draft,
    createdAt: draft.createdAt || ts,
  }
  if (draft.$type === BOARD_COLLECTION) stamped.updatedAt = ts
  return Object.fromEntries(
    Object.entries(stamped).filter(([, v]) => v !== undefined && v !== ''),
  ) as T
}

export type StoredPin = {uri: string; rkey: string; pin: PinRecord}

/** Pin order inside a board: manual position first, then newest first. */
export function orderedPins(pins: StoredPin[]): StoredPin[] {
  return [...pins].sort((a, b) => {
    const pa = a.pin.position
    const pb = b.pin.position
    if (pa !== undefined && pb !== undefined && pa !== pb) return pa - pb
    if (pa !== undefined && pb === undefined) return -1
    if (pa === undefined && pb !== undefined) return 1
    return b.pin.createdAt.localeCompare(a.pin.createdAt)
  })
}

/** The cover pin: the chosen one if it still exists, else the newest pin. */
export function coverOf(
  board: BoardRecord,
  pins: StoredPin[],
): StoredPin | undefined {
  return (
    pins.find(p => p.uri === board.coverPin) ??
    [...pins].sort((a, b) => b.pin.createdAt.localeCompare(a.pin.createdAt))[0]
  )
}

/** Boards a viewer may see: owners see everything, others only public ones. */
export function visibleBoards<T extends {board: BoardRecord}>(
  boards: T[],
  isOwner: boolean,
): T[] {
  return isOwner ? boards : boards.filter(b => b.board.visibility !== 'private')
}

/** Which boards already hold this exact image, to show "saved in …" and block duplicates. */
export function boardsContaining(
  pinsByBoard: Map<string, StoredPin[]>,
  subject: PinSubject,
  imageIndex: number,
): string[] {
  const key = pinKey(subject, imageIndex)
  const out: string[] = []
  for (const [boardUri, pins] of pinsByBoard) {
    if (pins.some(p => pinKey(p.pin.subject, p.pin.imageIndex) === key))
      out.push(boardUri)
  }
  return out
}
