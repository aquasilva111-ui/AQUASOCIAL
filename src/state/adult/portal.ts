import {useSyncExternalStore} from 'react'

import {
  type CategoryPrefs,
  type FormatPrefs,
  hashForDraft,
  PORTAL_SEED,
  type PortalFormat,
  type PortalItem,
  type PortalLane,
  scanBeforePublish,
  selectPortalItems,
  selectWebResults,
  WEB_SEED,
  type WebResult,
} from '#/lib/adult/portal/model'
import {writeHideAdultFromMain} from '#/lib/moderation/adultContent'

export type PortalPrefs = {
  formats: FormatPrefs
  categories: CategoryPrefs
  mutedWords: string
  blurThumbnails: boolean
  autoplayVideos: boolean
  hideFromMain: boolean
  confirmExternal: boolean
  /** Placeholder until gov.br / Serpro Datavalid / Yoti are connected. */
  identityVerificationStatus: 'pending' | 'verified' | 'failed'
}

export type PortalReport = {
  id: string
  resourceId: string
  reason: string
  at: string
}

type PortalState = {
  prefs: PortalPrefs
  sidebarOpen: boolean
  lane: PortalLane
  format: PortalFormat | 'all'
  query: string
  sort: 'relevance' | 'recent'
  revealed: Record<string, boolean>
  saved: Record<string, boolean>
  published: PortalItem[]
  reports: PortalReport[]
  webExtra: WebResult[]
}

const INITIAL_PREFS: PortalPrefs = {
  formats: {
    post: true,
    video: true,
    article: true,
    visionboard: true,
    web: false,
  },
  categories: {
    artistico: true,
    literatura: true,
    explicito: false,
    fetiche: false,
  },
  mutedWords: '',
  blurThumbnails: true,
  autoplayVideos: false,
  hideFromMain: true,
  confirmExternal: true,
  identityVerificationStatus: 'pending',
}

function initialState(): PortalState {
  const revealed: Record<string, boolean> = {}
  for (const item of PORTAL_SEED) {
    if (item.startsRevealed) revealed[item.id] = true
  }
  return {
    prefs: INITIAL_PREFS,
    sidebarOpen: false,
    lane: 'foryou',
    format: 'all',
    query: '',
    sort: 'relevance',
    revealed,
    saved: {},
    published: [],
    reports: [],
    webExtra: [],
  }
}

let state = initialState()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function update(patch: Partial<PortalState>) {
  state = {...state, ...patch}
  emit()
}

export function getPortalState() {
  return state
}

export function subscribePortal(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePortalState() {
  return useSyncExternalStore(subscribePortal, getPortalState)
}

export function togglePortalSidebar() {
  update({sidebarOpen: !state.sidebarOpen})
}

export function setPortalLane(lane: PortalLane) {
  update({lane, format: 'all'})
}

export function setPortalFormat(format: PortalFormat | 'all') {
  update({format, lane: 'foryou'})
}

export function setPortalQuery(query: string) {
  update({query})
}

export function togglePortalSort() {
  update({sort: state.sort === 'relevance' ? 'recent' : 'relevance'})
}

export function toggleRevealed(id: string) {
  update({revealed: {...state.revealed, [id]: !state.revealed[id]}})
}

export function toggleSaved(id: string) {
  update({saved: {...state.saved, [id]: !state.saved[id]}})
}

export function setPortalPrefs(patch: Partial<PortalPrefs>) {
  const prefs = {...state.prefs, ...patch}
  if (patch.hideFromMain !== undefined)
    writeHideAdultFromMain(patch.hideFromMain)
  update({prefs})
}

export function toggleFormatPref(format: keyof FormatPrefs) {
  setPortalPrefs({
    formats: {...state.prefs.formats, [format]: !state.prefs.formats[format]},
  })
}

export function toggleCategoryPref(category: keyof CategoryPrefs) {
  setPortalPrefs({
    categories: {
      ...state.prefs.categories,
      [category]: !state.prefs.categories[category],
    },
  })
}

export function filePortalReport(resourceId: string, reason: string) {
  const report: PortalReport = {
    id: `local-${state.reports.length + 1}`,
    resourceId,
    reason,
    at: new Date().toISOString(),
  }
  update({reports: [report, ...state.reports]})
  return report
}

export type PublishDraft = {
  format: Exclude<PortalFormat, 'web'>
  title: string
  tags: string[]
  visibility: 'aqua18' | 'subscribers'
  consent: boolean
}

export type PublishResult =
  | {ok: true; item: PortalItem}
  | {ok: false; reason: string}

/** Runs the hash stub, then keeps a quarantined draft out of the feed. */
export function publishPortalDraft(draft: PublishDraft): PublishResult {
  if (!draft.consent) {
    return {ok: false, reason: 'A declaração de consentimento é obrigatória.'}
  }
  const title = draft.title.trim()
  if (title.length < 3) {
    return {ok: false, reason: 'Dê um título com pelo menos 3 caracteres.'}
  }
  const hash = hashForDraft(title)
  if (scanBeforePublish(hash) === 'quarantine') {
    return {
      ok: false,
      reason:
        'A checagem de hash reteve esta publicação para moderação. Ela não entrou no feed.',
    }
  }
  const item: PortalItem = {
    id: `pi-local-${state.published.length + 1}`,
    format: draft.format,
    title,
    handle: 'voce',
    likes: 0,
    comments: 0,
    categories: ['artistico'],
    tags: draft.tags,
    adult: true,
  }
  update({published: [item, ...state.published]})
  return {ok: true, item}
}

export function usePortalFeed() {
  const snapshot = usePortalState()
  const items = selectPortalItems({
    items: [...snapshot.published, ...PORTAL_SEED],
    format: snapshot.format,
    query: snapshot.query,
    lane: snapshot.lane,
    savedIds: Object.entries(snapshot.saved)
      .filter(([, on]) => on)
      .map(([id]) => id),
    mutedWords: snapshot.prefs.mutedWords,
    formats: snapshot.prefs.formats,
    categories: snapshot.prefs.categories,
  })
  if (snapshot.sort === 'recent') items.reverse()
  return {state: snapshot, items}
}

export function usePortalWeb(query: string, category: string) {
  const snapshot = usePortalState()
  return selectWebResults([...snapshot.webExtra, ...WEB_SEED], query, category)
}
