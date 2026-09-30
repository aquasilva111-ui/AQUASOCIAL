import {useSyncExternalStore} from 'react'

/**
 * Playback state for the AQUA View watch experience: the "watch next"
 * queue, the autoplay preference and the miniplayer. Session-scoped and
 * in memory (the autoplay switch is also remembered on this device);
 * nothing here is written to the user's account or the social graph.
 */

export type ViewVideoRef = {
  uri: string
  /** Author DID and record key, for /videos/watch/:did/:rkey. */
  did: string
  rkey: string
  title: string
  author: string
  thumbnail?: string
}

export type MiniPlayerState = ViewVideoRef & {
  playlist: string
  /** 'audio' = music/podcast: pill with cover, no watch page to open. */
  kind?: 'video' | 'audio'
  /** Played by a music provider's own SDK (state/music), not by AQUA. */
  external?: boolean
  /** Position to resume from (seconds). */
  time: number
  watermarkUri?: string
}

type State = {
  queue: ViewVideoRef[]
  autoplay: boolean
  mini: MiniPlayerState | null
}

const AUTOPLAY_KEY = 'aqua.view.autoplay'
const QUEUE_LIMIT = 50

function readAutoplay(): boolean {
  try {
    const v = globalThis.localStorage?.getItem(AUTOPLAY_KEY)
    return v === null || v === undefined ? true : v === '1'
  } catch {
    return true
  }
}

let state: State = {queue: [], autoplay: readAutoplay(), mini: null}
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = {...state, ...patch}
  listeners.forEach(l => l())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getViewPlayback() {
  return state
}

export function useViewPlayback() {
  return useSyncExternalStore(subscribe, getViewPlayback, getViewPlayback)
}

// ------------------------------------------------------------ queue

export function addToQueue(video: ViewVideoRef) {
  if (state.queue.some(v => v.uri === video.uri)) return
  set({queue: [...state.queue, video].slice(-QUEUE_LIMIT)})
}

export function removeFromQueue(uri: string) {
  set({queue: state.queue.filter(v => v.uri !== uri)})
}

export function clearQueue() {
  set({queue: []})
}

export function isQueued(uri: string) {
  return state.queue.some(v => v.uri === uri)
}

/**
 * What plays after `currentUri`: the first queued video that isn't the one
 * playing, else the first recommendation.
 */
export function pickNext(
  queue: ViewVideoRef[],
  currentUri: string,
  recommended: ViewVideoRef[],
): {video: ViewVideoRef; fromQueue: boolean} | undefined {
  const queued = queue.find(v => v.uri !== currentUri)
  if (queued) return {video: queued, fromQueue: true}
  const rec = recommended.find(v => v.uri !== currentUri)
  return rec ? {video: rec, fromQueue: false} : undefined
}

// ------------------------------------------------------------ autoplay

export function setAutoplay(autoplay: boolean) {
  try {
    globalThis.localStorage?.setItem(AUTOPLAY_KEY, autoplay ? '1' : '0')
  } catch {}
  set({autoplay})
}

// ------------------------------------------------------------ miniplayer

export function openMiniPlayer(mini: MiniPlayerState) {
  set({mini})
}

/** Starts the floating player for an audio-only source (HLS or direct file). */
export function playAudio(
  audio: Omit<ViewVideoRef, 'did' | 'rkey'> & {src: string},
) {
  const {src, ...ref} = audio
  set({
    mini: {...ref, did: '', rkey: '', playlist: src, time: 0, kind: 'audio'},
  })
}

export function closeMiniPlayer() {
  if (state.mini) set({mini: null})
}

/**
 * Records the miniplayer's position without re-rendering subscribers (it
 * changes several times a second; only a resume needs it).
 */
export function noteMiniPlayerTime(uri: string, time: number) {
  if (state.mini && state.mini.uri === uri) state.mini.time = time
}

/** Where a watch page for `uri` should resume, if the miniplayer has it. */
export function peekMiniPlayerTime(uri: string): number | undefined {
  return state.mini && state.mini.uri === uri ? state.mini.time : undefined
}

/** Called by a watch page taking over playback; returns where to resume. */
export function takeOverFromMiniPlayer(uri: string): number | undefined {
  const mini = state.mini
  if (!mini) return undefined
  set({mini: null})
  return mini.uri === uri ? mini.time : undefined
}

/** Test helper. */
export function resetViewPlayback() {
  state = {queue: [], autoplay: true, mini: null}
  listeners.forEach(l => l())
}
