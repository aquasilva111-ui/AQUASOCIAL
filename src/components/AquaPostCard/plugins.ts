import {useSyncExternalStore} from 'react'

/**
 * Plug points for data the feed payload does not carry yet.
 * Nothing here talks to a network or to base-de-sinteses. Call the setters
 * when a real source exists; until then every post gets an empty snapshot.
 */

export type ConventionSource = 'requested' | 'inferred'

export type SurfacedConvention = {
  id: string
  /** Short name shown in the sheet, e.g. "Fotografia suave". */
  label: string
  /** One line under the name, e.g. "You follow this theme". */
  detail: string
  source: ConventionSource
}

export type WhySeeingThis = {
  postUri: string
  conventions: SurfacedConvention[]
}

export type WhySeeingThisAction = {
  type: 'show_more' | 'show_less' | 'mute'
  postUri: string
  conventionId: string
}

export type WhySeeingThisProvider = (
  postUri: string,
) => WhySeeingThis | undefined

export type PostLikerPreview = {
  did: string
  avatar?: string
  handle?: string
  displayName?: string
}

type LikerProvider = (postUri: string) => PostLikerPreview[]

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

let whyProvider: WhySeeingThisProvider = () => undefined
const whyCache = new Map<string, WhySeeingThis>()

export function setWhySeeingThisProvider(next: WhySeeingThisProvider) {
  whyProvider = next
  whyCache.clear()
  emit()
}

function whySnapshot(postUri: string): WhySeeingThis {
  const cached = whyCache.get(postUri)
  if (cached) return cached
  const next = whyProvider(postUri) ?? {postUri, conventions: []}
  whyCache.set(postUri, next)
  return next
}

export function useWhySeeingThis(postUri: string): WhySeeingThis {
  return useSyncExternalStore(
    subscribe,
    () => whySnapshot(postUri),
    () => whySnapshot(postUri),
  )
}

let actionHandler: (action: WhySeeingThisAction) => void = () => {}

export function setWhySeeingThisActionHandler(
  next: (action: WhySeeingThisAction) => void,
) {
  actionHandler = next
}

export function dispatchWhySeeingThis(action: WhySeeingThisAction) {
  actionHandler(action)
}

/**
 * Where "Minhas Convenções" goes. Unset until that screen exists;
 * the sheet then explains the list in place instead of opening a dead route.
 */
let conventionsOpener: (() => void) | undefined

export function setMyConventionsOpener(next: (() => void) | undefined) {
  conventionsOpener = next
}

export function openMyConventions() {
  conventionsOpener?.()
  return conventionsOpener !== undefined
}

let likerProvider: LikerProvider = () => []
const likerCache = new Map<string, PostLikerPreview[]>()

export function setPostLikerPreviewProvider(next: LikerProvider) {
  likerProvider = next
  likerCache.clear()
  emit()
}

function likerSnapshot(postUri: string) {
  const cached = likerCache.get(postUri)
  if (cached) return cached
  const next = likerProvider(postUri) ?? []
  likerCache.set(postUri, next)
  return next
}

export function usePostLikerPreviews(postUri: string): PostLikerPreview[] {
  return useSyncExternalStore(
    subscribe,
    () => likerSnapshot(postUri),
    () => likerSnapshot(postUri),
  )
}

/**
 * Emoji reaction chosen on this device only. Not persisted and not sent
 * to a backend — replace `memory` when reactions exist on the post record.
 */
const reactions = new Map<string, string>()

export function usePostReaction(postUri: string) {
  const emoji = useSyncExternalStore(
    subscribe,
    () => reactions.get(postUri),
    () => reactions.get(postUri),
  )
  const setReaction = (next: string | undefined) => {
    if (next) reactions.set(postUri, next)
    else reactions.delete(postUri)
    emit()
  }
  return {emoji, setReaction}
}
