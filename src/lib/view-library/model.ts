/**
 * Pure model for the Aqua Views library: watch history and "watch later"
 * (kept on this device) plus playlists and collections (records in the
 * owner's own repo). No React, no network, so it is unit-testable.
 */
import {type ViewVideoRef} from '#/state/view-playback'

export const HISTORY_LIMIT = 200
export const WATCH_LATER_LIMIT = 200

export type HistoryEntry = {ref: ViewVideoRef; at: number}

// ------------------------------------------------------------ stored refs

/** localStorage is untrusted input: keep only well-formed refs. */
export function normalizeRef(raw: unknown): ViewVideoRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (
    typeof r.uri !== 'string' ||
    !r.uri.startsWith('at://') ||
    typeof r.did !== 'string' ||
    typeof r.rkey !== 'string' ||
    !r.rkey
  ) {
    return undefined
  }
  return {
    uri: r.uri,
    did: r.did,
    rkey: r.rkey,
    title: typeof r.title === 'string' && r.title ? r.title : 'Vídeo',
    author: typeof r.author === 'string' ? r.author : '',
    thumbnail: typeof r.thumbnail === 'string' ? r.thumbnail : undefined,
  }
}

export function normalizeRefs(raw: unknown): ViewVideoRef[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ViewVideoRef[] = []
  for (const item of raw) {
    const ref = normalizeRef(item)
    if (!ref || seen.has(ref.uri)) continue
    seen.add(ref.uri)
    out.push(ref)
  }
  return out
}

export function normalizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: HistoryEntry[] = []
  for (const item of raw) {
    const ref = normalizeRef((item as {ref?: unknown} | null)?.ref)
    const at = (item as {at?: unknown} | null)?.at
    if (!ref || typeof at !== 'number' || !Number.isFinite(at)) continue
    if (seen.has(ref.uri)) continue
    seen.add(ref.uri)
    out.push({ref, at})
  }
  return out.sort((x, y) => y.at - x.at).slice(0, HISTORY_LIMIT)
}

// ------------------------------------------------------------ history

/** Newest first; watching something again moves it to the top. */
export function recordHistory(
  list: HistoryEntry[],
  ref: ViewVideoRef,
  now: number,
): HistoryEntry[] {
  return [{ref, at: now}, ...list.filter(e => e.ref.uri !== ref.uri)].slice(
    0,
    HISTORY_LIMIT,
  )
}

export function removeHistory(list: HistoryEntry[], uri: string) {
  return list.filter(e => e.ref.uri !== uri)
}

export function searchHistory(list: HistoryEntry[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    e =>
      e.ref.title.toLowerCase().includes(q) ||
      e.ref.author.toLowerCase().includes(q),
  )
}

const DAY = 24 * 60 * 60 * 1000

function startOfDay(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function dayBucket(at: number, now: number): string {
  const diff = Math.round((startOfDay(now) - startOfDay(at)) / DAY)
  if (diff <= 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  if (diff < 7) return 'Esta semana'
  return 'Mais antigos'
}

export function groupHistory(
  list: HistoryEntry[],
  now: number,
): {label: string; items: HistoryEntry[]}[] {
  const groups: {label: string; items: HistoryEntry[]}[] = []
  for (const entry of list) {
    const label = dayBucket(entry.at, now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(entry)
    else groups.push({label, items: [entry]})
  }
  return groups
}

// ------------------------------------------------------------ watch later

export function addWatchLater(list: ViewVideoRef[], ref: ViewVideoRef) {
  if (list.some(v => v.uri === ref.uri)) return list
  return [...list, ref].slice(-WATCH_LATER_LIMIT)
}

export function removeWatchLater(list: ViewVideoRef[], uri: string) {
  return list.filter(v => v.uri !== uri)
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list
  const clamped = Math.max(0, Math.min(list.length - 1, to))
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(clamped, 0, item)
  return next
}

// ------------------------------------------------------------ lists (PDS)

export type ViewListKind = 'playlist' | 'collection'
export type ViewListVisibility = 'public' | 'unlisted' | 'private'

export const LIST_COLLECTIONS: Record<ViewListKind, string> = {
  playlist: 'place.aqua.view.playlist',
  collection: 'place.aqua.view.collection',
}

export const LIST_LABELS: Record<
  ViewListKind,
  {singular: string; plural: string}
> = {
  playlist: {singular: 'Playlist', plural: 'Playlists'},
  collection: {singular: 'Coleção', plural: 'Coleções'},
}

export const VISIBILITY_LABELS: Record<ViewListVisibility, string> = {
  public: 'Pública',
  unlisted: 'Não listada',
  private: 'Privada',
}

export const LIST_LIMITS = {title: 60, description: 500, items: 500}

export type ViewListItem = {uri: string; addedAt: string}

export type ViewListRecord = {
  $type: string
  title: string
  description?: string
  visibility: ViewListVisibility
  items: ViewListItem[]
  createdAt: string
  updatedAt: string
}

export type ViewListView = {
  uri: string
  rkey: string
  kind: ViewListKind
  title: string
  description?: string
  visibility: ViewListVisibility
  items: ViewListItem[]
  createdAt: string
  updatedAt: string
}

const VISIBILITIES: ViewListVisibility[] = ['public', 'unlisted', 'private']

function isPostUri(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^at:\/\/[^/]+\/app\.bsky\.feed\.post\/[^/]+$/.test(v)
  )
}

export function newListRecord(
  kind: ViewListKind,
  draft: {
    title: string
    description?: string
    visibility: ViewListVisibility
    items?: ViewListItem[]
  },
  now = new Date(),
): ViewListRecord {
  const iso = now.toISOString()
  const description = draft.description
    ?.trim()
    .slice(0, LIST_LIMITS.description)
  return {
    $type: LIST_COLLECTIONS[kind],
    title: draft.title.trim().slice(0, LIST_LIMITS.title),
    ...(description ? {description} : {}),
    visibility: draft.visibility,
    items: (draft.items ?? []).slice(0, LIST_LIMITS.items),
    createdAt: iso,
    updatedAt: iso,
  }
}

/** Repo data is untrusted: returns undefined for anything unusable. */
export function normalizeList(
  kind: ViewListKind,
  raw: {uri: string; value: unknown},
): ViewListView | undefined {
  const v = raw.value as Partial<Record<string, unknown>> | null
  if (!v || typeof v.title !== 'string') return undefined
  const title = v.title.trim().slice(0, LIST_LIMITS.title)
  if (!title) return undefined
  const seen = new Set<string>()
  const items: ViewListItem[] = []
  for (const item of Array.isArray(v.items) ? v.items : []) {
    const uri = (item as {uri?: unknown} | null)?.uri
    if (!isPostUri(uri) || seen.has(uri)) continue
    seen.add(uri)
    const addedAt = (item as {addedAt?: unknown}).addedAt
    items.push({uri, addedAt: typeof addedAt === 'string' ? addedAt : ''})
  }
  const createdAt = typeof v.createdAt === 'string' ? v.createdAt : ''
  return {
    uri: raw.uri,
    rkey: raw.uri.split('/').pop() ?? '',
    kind,
    title,
    description:
      typeof v.description === 'string' && v.description.trim()
        ? v.description.trim().slice(0, LIST_LIMITS.description)
        : undefined,
    visibility: VISIBILITIES.includes(v.visibility as ViewListVisibility)
      ? (v.visibility as ViewListVisibility)
      : 'private',
    items: items.slice(0, LIST_LIMITS.items),
    createdAt,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : createdAt,
  }
}

export function listToRecord(
  list: ViewListView,
  patch: Partial<
    Pick<ViewListRecord, 'title' | 'description' | 'visibility' | 'items'>
  > = {},
  now = new Date(),
): ViewListRecord {
  const next = newListRecord(
    list.kind,
    {
      title: patch.title ?? list.title,
      description:
        'description' in patch ? patch.description : list.description,
      visibility: patch.visibility ?? list.visibility,
      items: patch.items ?? list.items,
    },
    now,
  )
  return {...next, createdAt: list.createdAt || next.createdAt}
}

export function addListItem(
  items: ViewListItem[],
  uri: string,
  now = new Date(),
): ViewListItem[] {
  if (!isPostUri(uri) || items.some(i => i.uri === uri)) return items
  return [...items, {uri, addedAt: now.toISOString()}].slice(
    0,
    LIST_LIMITS.items,
  )
}

export function removeListItem(items: ViewListItem[], uri: string) {
  return items.filter(i => i.uri !== uri)
}

/** Who can open a list: everyone unless private; private is owner-only. */
export function canViewList(list: ViewListView, isOwner: boolean) {
  return isOwner || list.visibility !== 'private'
}

// ------------------------------------------------------------ subscriptions

export type RecencyFilter = 'all' | 'today' | 'week'

/** Filters the subscriptions feed by age (calendar day / last 7 days). */
export function matchesRecency(
  iso: string,
  filter: RecencyFilter,
  now: number,
): boolean {
  if (filter === 'all') return true
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return false
  const diff = Math.round((startOfDay(now) - startOfDay(at)) / DAY)
  return filter === 'today' ? diff <= 0 : diff < 7
}

export function sumStat(items: {count?: number}[]): number {
  return items.reduce((n, i) => n + (i.count ?? 0), 0)
}

export function compactCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000)
    return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.0', '')} mil`
  return `${(n / 1_000_000).toFixed(1).replace('.0', '')} mi`
}
