/**
 * AQUA View Channel — the audiovisual presence of an existing AQUA Profile.
 *
 * It is NOT an account. Identity (DID, handle, auth), avatar, display name,
 * followers ("subscribers"), permissions and moderation all come from the
 * AQUA Profile. The channel only stores what is View-specific, as one
 * record in the owner's own repo:
 *
 *   at://<did>/place.aqua.view.channel/self
 *
 * Writes go to the owner's PDS, so only the owner can change it — the same
 * permission model as every other AQUA record. Trailer, featured video and
 * sections hold references (AT URIs) to real posts; banner and watermark
 * are blobs in the same PDS. Nothing is copied.
 */

export const VIEW_CHANNEL_COLLECTION = 'place.aqua.view.channel'
export const VIEW_CHANNEL_RKEY = 'self'

export type ChannelStatus = 'draft' | 'active' | 'suspended'
export type ChannelVisibility = 'public' | 'private'

export type ChannelSectionType =
  | 'latest'
  | 'popular'
  | 'videos'
  | 'live'
  | 'past_live'
  | 'playlists'
  | 'clips'
  | 'drops'
  | 'custom_playlist'
  | 'custom_collection'

export type ChannelSection = {
  id: string
  type: ChannelSectionType
  /** Custom title; falls back to the type's default label. */
  title?: string
  /** Reference for custom_* sections (playlist/collection id, later). */
  sourceId?: string
  position: number
  visibility: 'visible' | 'hidden'
}

export type ChannelLink = {
  id: string
  label: string
  url: string
  position: number
}

/** Blob reference as stored in the record (CID + mime). */
export type ChannelBlob = {
  $type: 'blob'
  ref: {$link: string}
  mimeType: string
  size: number
}

export type ViewChannelRecord = {
  $type: typeof VIEW_CHANNEL_COLLECTION
  /** Only when the owner wants a name different from the profile's. */
  displayNameOverride?: string
  description?: string
  banner?: ChannelBlob
  /** Vertical focus of the banner crop, 0 (top) – 100 (bottom). */
  bannerFocusY?: number
  watermark?: ChannelBlob
  defaultLanguage?: string
  topics?: string[]
  /** Stored states; "suspended" only ever comes from AQUA moderation. */
  status: 'draft' | 'active'
  visibility: ChannelVisibility
  trailerUri?: string
  featuredUri?: string
  sections: ChannelSection[]
  links: ChannelLink[]
  /** Public contact shown on About, only when contactVisible. */
  contact?: string
  contactVisible?: boolean
  createdAt: string
  updatedAt: string
}

export const SECTION_LABELS: Record<ChannelSectionType, string> = {
  latest: 'Vídeos mais recentes',
  popular: 'Vídeos populares',
  videos: 'Uploads',
  live: 'Ao vivo agora',
  past_live: 'Transmissões anteriores',
  playlists: 'Playlists',
  clips: 'Clips',
  drops: 'Drops',
  custom_playlist: 'Playlist',
  custom_collection: 'Coleção',
}

/** Section types whose content exists in AQUA today. */
export const AVAILABLE_SECTION_TYPES: ChannelSectionType[] = [
  'latest',
  'popular',
  'videos',
  'live',
  'drops',
]

export const LANGUAGES: {code: string; label: string}[] = [
  {code: 'pt', label: 'Português'},
  {code: 'en', label: 'English'},
  {code: 'es', label: 'Español'},
  {code: 'fr', label: 'Français'},
  {code: 'de', label: 'Deutsch'},
  {code: 'it', label: 'Italiano'},
  {code: 'ja', label: '日本語'},
]

export const LIMITS = {
  displayName: 64,
  description: 1000,
  topics: 10,
  topic: 32,
  links: 10,
  linkLabel: 40,
  url: 300,
  contact: 200,
  sections: 12,
  sectionTitle: 60,
}

let idCounter = 0
export function newLocalId(prefix: string) {
  idCounter++
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`
}

export function defaultSections(): ChannelSection[] {
  return (['latest', 'popular', 'live', 'videos'] as const).map(
    (type, position) => ({
      id: `sec_${type}`,
      type,
      position,
      visibility: 'visible',
    }),
  )
}

export function newChannelRecord(
  input: Partial<ViewChannelRecord> = {},
  now = new Date(),
): ViewChannelRecord {
  const ts = now.toISOString()
  return {
    $type: VIEW_CHANNEL_COLLECTION,
    status: 'active',
    visibility: 'public',
    sections: defaultSections(),
    links: [],
    topics: [],
    createdAt: ts,
    updatedAt: ts,
    ...input,
  }
}

const SECTION_TYPES = new Set(Object.keys(SECTION_LABELS))
const clampText = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

function isBlob(v: unknown): v is ChannelBlob {
  const b = v as ChannelBlob | undefined
  return (
    !!b &&
    typeof b === 'object' &&
    typeof b.ref?.$link === 'string' &&
    typeof b.mimeType === 'string' &&
    b.mimeType.startsWith('image/')
  )
}

/** Only https (or http) links; nothing that runs code or opens apps. */
export function safeUrl(raw: string): string | undefined {
  const text = raw.trim()
  if (!text || text.length > LIMITS.url) return undefined
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text)
    ? text
    : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    if (!url.hostname.includes('.')) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

export function isPostUri(uri: unknown, did?: string): uri is string {
  if (typeof uri !== 'string') return false
  const m = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/[^/]+$/)
  return !!m && (!did || m[1] === did)
}

/** Sections sorted by position, positions renumbered 0..n-1. */
export function sortSections(sections: ChannelSection[]): ChannelSection[] {
  return [...sections]
    .sort((x, y) => x.position - y.position)
    .map((s, position) => ({...s, position}))
}

export function moveItem<T extends {position: number}>(
  list: T[],
  index: number,
  delta: -1 | 1,
): T[] {
  const sorted = [...list].sort((x, y) => x.position - y.position)
  const target = index + delta
  if (target < 0 || target >= sorted.length) return sorted
  ;[sorted[index], sorted[target]] = [sorted[target], sorted[index]]
  return sorted.map((item, position) => ({...item, position}))
}

/**
 * Parses whatever is in the repo into a safe channel config. Records are
 * public data other clients may write, so every field is validated;
 * unknown values are dropped rather than trusted. References to videos
 * must point at the owner's own posts.
 */
export function normalizeChannel(
  raw: unknown,
  ownerDid: string,
): ViewChannelRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, any>
  const sections: ChannelSection[] = Array.isArray(r.sections)
    ? r.sections
        .filter(
          (s: any) =>
            s && typeof s.id === 'string' && SECTION_TYPES.has(s.type),
        )
        .slice(0, LIMITS.sections)
        .map((s: any, i: number) => ({
          id: String(s.id).slice(0, 40),
          type: s.type,
          title: clampText(s.title, LIMITS.sectionTitle),
          sourceId: clampText(s.sourceId, 200),
          position: Number.isFinite(s.position) ? Number(s.position) : i,
          visibility: s.visibility === 'hidden' ? 'hidden' : 'visible',
        }))
    : defaultSections()
  const links: ChannelLink[] = Array.isArray(r.links)
    ? r.links
        .map((l: any, i: number) => {
          const url = typeof l?.url === 'string' ? safeUrl(l.url) : undefined
          const label = clampText(l?.label, LIMITS.linkLabel)
          if (!url || !label) return undefined
          return {
            id: typeof l.id === 'string' ? l.id.slice(0, 40) : `lnk_${i}`,
            label,
            url,
            position: Number.isFinite(l.position) ? Number(l.position) : i,
          }
        })
        .filter((l: ChannelLink | undefined): l is ChannelLink => !!l)
        .slice(0, LIMITS.links)
    : []
  const focus = Number(r.bannerFocusY)
  return {
    $type: VIEW_CHANNEL_COLLECTION,
    displayNameOverride: clampText(r.displayNameOverride, LIMITS.displayName),
    description: clampText(r.description, LIMITS.description),
    banner: isBlob(r.banner) ? r.banner : undefined,
    bannerFocusY: Number.isFinite(focus)
      ? Math.min(100, Math.max(0, Math.round(focus)))
      : 50,
    watermark: isBlob(r.watermark) ? r.watermark : undefined,
    defaultLanguage: LANGUAGES.some(l => l.code === r.defaultLanguage)
      ? r.defaultLanguage
      : undefined,
    topics: Array.isArray(r.topics)
      ? r.topics
          .map((t: unknown) => clampText(t, LIMITS.topic))
          .filter((t: string | undefined): t is string => !!t)
          .slice(0, LIMITS.topics)
      : [],
    status: r.status === 'draft' ? 'draft' : 'active',
    visibility: r.visibility === 'private' ? 'private' : 'public',
    trailerUri: isPostUri(r.trailerUri, ownerDid) ? r.trailerUri : undefined,
    featuredUri: isPostUri(r.featuredUri, ownerDid) ? r.featuredUri : undefined,
    sections: sortSections(sections),
    links: [...links].sort((x, y) => x.position - y.position),
    contact: clampText(r.contact, LIMITS.contact),
    contactVisible: r.contactVisible === true,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
  }
}

/**
 * What a viewer may see. Suspension comes only from AQUA moderation on the
 * profile; drafts and private channels are visible to the owner only.
 * (AT records are public data: "private" hides the channel in AQUA, it is
 * not an access-control boundary.)
 */
export function channelAccess(input: {
  channel: ViewChannelRecord | undefined
  isOwner: boolean
  moderated: boolean
}):
  | {state: 'none'}
  | {state: 'suspended'}
  | {state: 'unavailable'}
  | {state: 'visible'; status: ChannelStatus} {
  if (input.moderated) return {state: 'suspended'}
  if (!input.channel) return {state: 'none'}
  if (
    !input.isOwner &&
    (input.channel.status === 'draft' || input.channel.visibility === 'private')
  )
    return {state: 'unavailable'}
  return {state: 'visible', status: input.channel.status}
}

export type VideoStat = {
  uri: string
  indexedAt: string
  likeCount?: number
  repostCount?: number
  replyCount?: number
  quoteCount?: number
}

export function latestFirst<T extends VideoStat>(videos: T[]): T[] {
  return [...videos].sort((x, y) => y.indexedAt.localeCompare(x.indexedAt))
}

/** Engagement-weighted, ties broken by recency. */
export function popularFirst<T extends VideoStat>(videos: T[]): T[] {
  const score = (v: VideoStat) =>
    (v.likeCount ?? 0) +
    2 * (v.repostCount ?? 0) +
    2 * (v.quoteCount ?? 0) +
    (v.replyCount ?? 0)
  return [...videos].sort(
    (x, y) => score(y) - score(x) || y.indexedAt.localeCompare(x.indexedAt),
  )
}

/** Record ready to write: timestamps set, positions normalized. */
export function toWritableRecord(
  draft: ViewChannelRecord,
  now = new Date(),
): ViewChannelRecord {
  const clean = Object.fromEntries(
    Object.entries({
      ...draft,
      sections: sortSections(draft.sections),
      links: [...draft.links]
        .sort((x, y) => x.position - y.position)
        .map((l, position) => ({...l, position})),
      createdAt: draft.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
    }).filter(([, v]) => v !== undefined && v !== ''),
  )
  return clean as ViewChannelRecord
}

export function channelPath(handle: string) {
  return `/views/channel/${encodeURIComponent(handle)}`
}
