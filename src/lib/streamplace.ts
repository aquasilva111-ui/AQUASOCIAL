import {type AppBskyActorDefs} from '@atproto/api'

/**
 * Streamplace node that powers AQUA video/live infrastructure.
 * Override with EXPO_PUBLIC_STREAMPLACE_NODE when running your own node
 * (see streamplace/ in this repo).
 */
export const STREAMPLACE_NODE = (
  process.env.EXPO_PUBLIC_STREAMPLACE_NODE || 'https://stream.place'
).replace(/\/$/, '')

export interface StreamplaceLivestreamRecord {
  title?: string
  url?: string
  createdAt?: string
  thumb?: unknown
  tags?: string[]
}

export interface StreamplaceLivestreamView {
  uri: string
  cid: string
  indexedAt: string
  author: AppBskyActorDefs.ProfileViewBasic
  record: StreamplaceLivestreamRecord
  viewerCount?: {count: number; total?: number}
}

export function liveThumbUrl(did: string) {
  return `${STREAMPLACE_NODE}/api/playback/${did}/stream.jpg`
}

export function liveWatchUrl(handleOrDid: string) {
  return `${STREAMPLACE_NODE}/${handleOrDid}`
}

export function liveEmbedUrl(handleOrDid: string) {
  return `${STREAMPLACE_NODE}/embed/${handleOrDid}`
}

export function liveDashboardUrl() {
  return `${STREAMPLACE_NODE}/live`
}
