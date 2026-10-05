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

export const OVERLAY_LIMITS = {
  items: 12,
  text: 140,
  sticker: 8,
  scaleMin: 0.5,
  scaleMax: 4,
}
export const STORY_BACKGROUNDS = [
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#16A34A',
  '#0284C7',
  '#111827',
]
export const TEXT_COLORS = [
  '#FFFFFF',
  '#111827',
  '#FACC15',
  '#F472B6',
  '#60A5FA',
]
export const STICKERS = [
  '😀',
  '😍',
  '🔥',
  '🎉',
  '❤️',
  '✨',
  '👏',
  '😎',
  '🙌',
  '💯',
  '🌊',
  '☀️',
]

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

export type StoryFit = 'cover' | 'contain'

export type OverlayKind = 'text' | 'sticker'

/**
 * Text or emoji placed on a story. Position is the centre of the element as
 * a fraction (0..1) of the 9:16 story frame, so it renders the same at any
 * size. Stored in the record (not baked into the image).
 */
export interface StoryOverlay {
  id: string
  kind: OverlayKind
  text: string
  x: number
  y: number
  scale: number
  color: string
  /** Text only: draw it on a solid pill of `color`. */
  pill?: boolean
}

export interface StoryView {
  uri: string
  rkey: string
  createdAt: string
  /** Absent for text-only stories (a colour background + overlays). */
  mediaUrl?: string
  /** Raw blob, kept so the story can be added to a highlight. */
  media?: BlobJson
  /** Solid colour behind the media (or the whole story when text-only). */
  background?: string
  fit: StoryFit
  overlays: StoryOverlay[]
  aspectRatio?: AspectRatio
}

export interface HighlightItemRecord {
  media?: BlobJson
  background?: string
  fit?: StoryFit
  overlays?: StoryOverlay[]
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
  /** Cover photo; undefined when the first item is a text story. */
  coverUrl?: string
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

const HEX = /^#[0-9a-fA-F]{6}$/
export const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && HEX.test(v)

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n))

/** Repo data is untrusted: keeps only well-formed overlays, clamped. */
export function normalizeOverlays(raw: unknown): StoryOverlay[] {
  if (!Array.isArray(raw)) return []
  const out: StoryOverlay[] = []
  for (const item of raw) {
    if (out.length >= OVERLAY_LIMITS.items) break
    const o = item as Partial<Record<keyof StoryOverlay, unknown>> | null
    if (!o || (o.kind !== 'text' && o.kind !== 'sticker')) continue
    if (typeof o.text !== 'string') continue
    const text = o.text
      .trim()
      .slice(
        0,
        o.kind === 'text' ? OVERLAY_LIMITS.text : OVERLAY_LIMITS.sticker,
      )
    if (!text) continue
    const num = (v: unknown, d: number) =>
      typeof v === 'number' && Number.isFinite(v) ? v : d
    out.push({
      id:
        typeof o.id === 'string' && o.id ? o.id.slice(0, 24) : `o${out.length}`,
      kind: o.kind,
      text,
      x: clamp(num(o.x, 0.5), 0, 1),
      y: clamp(num(o.y, 0.5), 0, 1),
      scale: clamp(
        num(o.scale, 1),
        OVERLAY_LIMITS.scaleMin,
        OVERLAY_LIMITS.scaleMax,
      ),
      color: isHexColor(o.color) ? o.color : '#FFFFFF',
      ...(o.kind === 'text' && o.pill === true ? {pill: true} : {}),
    })
  }
  return out
}

/** A story needs a photo, or a colour background carrying some text/emoji. */
export function validateStoryDraft(draft: {
  hasMedia: boolean
  background?: string
  overlays: StoryOverlay[]
}): 'empty' | undefined {
  if (draft.hasMedia) return undefined
  return isHexColor(draft.background) && draft.overlays.length
    ? undefined
    : 'empty'
}

/** Stable identity of a story's content (blob, or look for text stories). */
export function storyKey(
  s: Pick<StoryView, 'media' | 'background' | 'createdAt' | 'overlays'>,
) {
  return (
    s.media?.ref.$link ??
    `bg:${s.background ?? ''}|${s.createdAt}|${JSON.stringify(s.overlays)}`
  )
}

/** Shape shared by story and highlight-item records. */
function readContent(v: {
  media?: unknown
  background?: unknown
  fit?: unknown
  overlays?: unknown
  aspectRatio?: unknown
}):
  | Pick<StoryView, 'media' | 'background' | 'fit' | 'overlays' | 'aspectRatio'>
  | undefined {
  const media = v.media === undefined ? undefined : asBlob(v.media)
  if (v.media !== undefined && !media) return undefined
  const background = isHexColor(v.background) ? v.background : undefined
  const overlays = normalizeOverlays(v.overlays)
  if (!media && !(background && overlays.length)) return undefined
  return {
    media,
    background,
    fit: v.fit === 'cover' ? 'cover' : 'contain',
    overlays,
    aspectRatio: asAspect(v.aspectRatio),
  }
}

/** Repo data is untrusted: returns undefined for anything malformed. */
export function normalizeStory(
  raw: {uri: string; value: unknown},
  ctx: {did: string; pdsUrl: string},
): StoryView | undefined {
  const v = raw.value as {createdAt?: unknown} | null
  if (!v || typeof v.createdAt !== 'string') return undefined
  if (Number.isNaN(new Date(v.createdAt).getTime())) return undefined
  const content = readContent(v as Parameters<typeof readContent>[0])
  if (!content) return undefined
  return {
    uri: raw.uri,
    rkey: rkeyOf(raw.uri),
    createdAt: v.createdAt,
    ...content,
    mediaUrl: content.media
      ? blobUrl(ctx.pdsUrl, ctx.did, content.media.ref.$link)
      : undefined,
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
    const it = item as {createdAt?: unknown} | null
    const content = it
      ? readContent(it as Parameters<typeof readContent>[0])
      : undefined
    if (!content) return
    items.push({
      uri: `${raw.uri}#${i}`,
      rkey: rkeyOf(raw.uri),
      createdAt: typeof it?.createdAt === 'string' ? it.createdAt : createdAt,
      ...content,
      mediaUrl: content.media
        ? blobUrl(ctx.pdsUrl, ctx.did, content.media.ref.$link)
        : undefined,
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
    const key = storyKey(s)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      ...(s.media ? {media: s.media} : {}),
      ...(s.background ? {background: s.background} : {}),
      fit: s.fit,
      ...(s.overlays.length ? {overlays: s.overlays} : {}),
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
