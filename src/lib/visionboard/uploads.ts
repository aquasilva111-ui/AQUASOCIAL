import {isBoardUri} from '#/lib/visionboard/boards'

/**
 * Images a user drops straight into a board. They are stored as records in
 * the user's own repo (a blob plus the board it belongs to) and are NOT
 * posts: nothing is published to any feed. Like all repo data they are
 * technically public to anyone who knows the blob's address.
 */
export const UPLOAD_COLLECTION = 'place.aqua.visionboard.upload'

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const MAX_FILES_PER_DROP = 12
/** Refuse absurd originals before spending time decoding them. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

export type BlobJson = {
  $type: 'blob'
  ref: {$link: string}
  mimeType: string
  size: number
}

export type UploadRecord = {
  $type: typeof UPLOAD_COLLECTION
  /** at:// URI of the board, always in the same repo as the upload. */
  board: string
  image: BlobJson
  alt?: string
  aspectRatio?: {width: number; height: number}
  createdAt: string
}

export type StoredUpload = {uri: string; rkey: string; upload: UploadRecord}

const ALT_MAX = 300

export function newUploadRecord(
  input: Pick<UploadRecord, 'board' | 'image'> &
    Partial<Pick<UploadRecord, 'alt' | 'aspectRatio'>>,
  now = new Date(),
): UploadRecord {
  return {
    $type: UPLOAD_COLLECTION,
    createdAt: now.toISOString(),
    ...input,
  }
}

function isAcceptedType(mime: unknown): mime is string {
  return (
    typeof mime === 'string' &&
    (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(mime)
  )
}

/** Repo data is public and writable by any client: validate every field. */
export function normalizeUpload(
  raw: unknown,
  ownerDid: string,
): UploadRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, any>
  if (!isBoardUri(r.board, ownerDid)) return undefined

  const blob = r.image
  const cid = blob?.ref?.$link
  if (
    blob?.$type !== 'blob' ||
    typeof cid !== 'string' ||
    !/^[A-Za-z0-9]{20,100}$/.test(cid) ||
    !isAcceptedType(blob.mimeType) ||
    typeof blob.size !== 'number' ||
    !Number.isFinite(blob.size)
  ) {
    return undefined
  }

  const w = Number(r.aspectRatio?.width)
  const h = Number(r.aspectRatio?.height)
  const aspectRatio =
    Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0
      ? {width: w, height: h}
      : undefined

  return {
    $type: UPLOAD_COLLECTION,
    board: r.board,
    image: {
      $type: 'blob',
      ref: {$link: cid},
      mimeType: blob.mimeType,
      size: blob.size,
    },
    alt:
      typeof r.alt === 'string' && r.alt.trim()
        ? r.alt.trim().slice(0, ALT_MAX)
        : undefined,
    aspectRatio,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
  }
}

export type DropCandidate = {name: string; type: string; size: number}

/**
 * Splits dropped files into the ones to upload and a reason per rejected one:
 * only images, within the size and per-drop limits.
 */
export function selectDroppedFiles<T extends DropCandidate>(
  files: T[],
  limit = MAX_FILES_PER_DROP,
): {accepted: T[]; rejected: {file: T; reason: string}[]} {
  const accepted: T[] = []
  const rejected: {file: T; reason: string}[] = []
  for (const file of files) {
    if (!isAcceptedType(file.type)) {
      rejected.push({file, reason: 'Só imagens JPG, PNG, WebP ou GIF.'})
    } else if (file.size > MAX_SOURCE_BYTES) {
      rejected.push({file, reason: 'Arquivo grande demais (máx. 25 MB).'})
    } else if (accepted.length >= limit) {
      rejected.push({file, reason: `Máximo de ${limit} imagens por vez.`})
    } else {
      accepted.push(file)
    }
  }
  return {accepted, rejected}
}

/** Public address of a blob on its PDS (same shape the Stories use). */
export function uploadBlobUrl(pdsUrl: string, did: string, cid: string) {
  return `${pdsUrl.replace(/\/+$/, '')}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cid)}`
}
