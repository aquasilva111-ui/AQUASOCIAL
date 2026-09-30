/**
 * Pure model for profile stories + highlights (no React / network), so it is
 * unit-testable. Stories live 24h; highlights are permanent albums that keep
 * a reference to the story blobs, so the media survives story expiry.
 */
export const STORY_COLLECTION = 'place.aqua.actor.story'
export const HIGHLIGHT_COLLECTION = 'place.aqua.actor.highlight'
export const STORY_TTL_MS = 24 * 60 * 60 * 1000
export const HIGHLIGHT_TITLE_MAX = 24
export const HIGHLIGHT_ITEMS_MAX = 50

/** Blob as it appears in raw record JSON (listRecords / getRecord). */
export interface BlobJson {
  $type: 'blob'
  ref: {$link: string}
  mimeType: string
  size: number
}

export interface AspectRatio {
  width: number
  height: number
}

export interface StoryView {
  uri: string
  rkey: string
  createdAt: string
  mediaUrl: string
  /** Raw blob, kept so the story can be added to a highlight. */
  media: BlobJson
  aspectRatio?: AspectRatio
}

export interface HighlightItemRecord {
  media: BlobJson
  createdAt: string
  aspectRatio?: AspectRatio
}

export interface HighlightRecord {
  $type: typeof HIGHLIGHT_COLLECTION
  title: string
  createdAt: string
  items: HighlightItemRecord[]
}

export interface HighlightView {
  uri: string
  rkey: string
  title: string
  createdAt: string
  coverUrl: string
  /** Same shape the StoryViewer already consumes. */
  items: StoryView[]
}

export function isExpired(createdAt: string, now = Date.now()) {
  const t = new Date(createdAt).getTime()
  return Number.isNaN(t) || now - t > STORY_TTL_MS
}

export function blobUrl(pdsUrl: string, did: string, cid: string) {
  return `${pdsUrl.replace(/\/+$/, '')}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cid)}`
}

/** Resolves a repo's PDS service endpoint from its DID document. */
export function getPdsEndpoint(didDoc: unknown): string | undefined {
  if (!didDoc || typeof didDoc !== 'object') return undefined
  const services = (didDoc as {service?: unknown}).service
  if (!Array.isArray(services)) return undefined
  const pds = services.find(
    (svc): svc is {id: string; serviceEndpoint: string} =>
      !!svc &&
      typeof svc === 'object' &&
      (svc as {id?: string}).id === '#atproto_pds' &&
      typeof (svc as {serviceEndpoint?: unknown}).serviceEndpoint === 'string',
  )
  return pds?.serviceEndpoint
}

function asBlob(v: unknown): BlobJson | undefined {
  if (!v || typeof v !== 'object') return undefined
  const b = v as Partial<BlobJson>
  if (typeof b.ref?.$link !== 'string' || !b.ref.$link) return undefined
  if (typeof b.mimeType !== 'string' || !b.mimeType.startsWith('image/')) {
    return undefined
  }
  return {
    $type: 'blob',
    ref: {$link: b.ref.$link},
    mimeType: b.mimeType,
    size: typeof b.size === 'number' ? b.size : 0,
  }
}

function asAspect(v: unknown): AspectRatio | undefined {
  if (!v || typeof v !== 'object') return undefined
  const {width, height} = v as Partial<AspectRatio>
  if (
    typeof width === 'number' &&
    typeof height === 'number' &&
    width > 0 &&
    height > 0
  ) {
    return {width, height}
  }
  return undefined
}

function rkeyOf(uri: string) {
  return uri.split('/').pop() ?? ''
}

/** Repo data is untrusted: returns undefined for anything malformed. */
export function normalizeStory(
  raw: {uri: string; value: unknown},
  ctx: {did: string; pdsUrl: string},
): StoryView | undefined {
  const v = raw.value as {
    createdAt?: unknown
    media?: unknown
    aspectRatio?: unknown
  }
  const media = asBlob(v?.media)
  if (!media || typeof v.createdAt !== 'string') return undefined
  if (Number.isNaN(new Date(v.createdAt).getTime())) return undefined
  return {
    uri: raw.uri,
    rkey: rkeyOf(raw.uri),
    createdAt: v.createdAt,
    media,
    aspectRatio: asAspect(v.aspectRatio),
    mediaUrl: blobUrl(ctx.pdsUrl, ctx.did, media.ref.$link),
  }
}

export function normalizeHighlight(
  raw: {uri: string; value: unknown},
  ctx: {did: string; pdsUrl: string},
): HighlightView | undefined {
  const v = raw.value as {title?: unknown; createdAt?: unknown; items?: unknown}
  if (!v || typeof v.title !== 'string' || !Array.isArray(v.items)) {
    return undefined
  }
  const title = v.title.trim().slice(0, HIGHLIGHT_TITLE_MAX)
  const createdAt = typeof v.createdAt === 'string' ? v.createdAt : ''
  const items: StoryView[] = []
  v.items.slice(0, HIGHLIGHT_ITEMS_MAX).forEach((item, i) => {
    const it = item as {
      media?: unknown
      createdAt?: unknown
      aspectRatio?: unknown
    }
    const media = asBlob(it?.media)
    if (!media) return
    items.push({
      uri: `${raw.uri}#${i}`,
      rkey: rkeyOf(raw.uri),
      createdAt: typeof it.createdAt === 'string' ? it.createdAt : createdAt,
      media,
      aspectRatio: asAspect(it.aspectRatio),
      mediaUrl: blobUrl(ctx.pdsUrl, ctx.did, media.ref.$link),
    })
  })
  if (!title || !items.length) return undefined
  return {
    uri: raw.uri,
    rkey: rkeyOf(raw.uri),
    title,
    createdAt,
    coverUrl: items[0].mediaUrl,
    items,
  }
}

export function storiesToItems(stories: StoryView[]): HighlightItemRecord[] {
  const seen = new Set<string>()
  const out: HighlightItemRecord[] = []
  for (const s of stories) {
    if (seen.has(s.media.ref.$link)) continue
    seen.add(s.media.ref.$link)
    out.push({
      media: s.media,
      createdAt: s.createdAt,
      aspectRatio: s.aspectRatio,
    })
  }
  return out.slice(0, HIGHLIGHT_ITEMS_MAX)
}

export function validateHighlightDraft(
  title: string,
  itemCount: number,
): 'title' | 'items' | undefined {
  if (!title.trim()) return 'title'
  if (itemCount < 1) return 'items'
  return undefined
}

export function newHighlightRecord(
  title: string,
  stories: StoryView[],
  now = new Date(),
): HighlightRecord {
  return {
    $type: HIGHLIGHT_COLLECTION,
    title: title.trim().slice(0, HIGHLIGHT_TITLE_MAX),
    createdAt: now.toISOString(),
    items: storiesToItems(stories),
  }
}
