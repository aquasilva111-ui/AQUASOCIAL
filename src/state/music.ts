import {useSyncExternalStore} from 'react'

import {PROVIDERS} from '#/lib/music'
import {
  MusicError,
  type MusicProviderId,
  type MusicTrack,
} from '#/lib/music/types'
import {
  closeMiniPlayer,
  getViewPlayback,
  openMiniPlayer,
  subscribe as subscribePlayback,
} from '#/state/view-playback'

/**
 * Music playing inside AQUA through a connected streaming service. The audio
 * comes from the provider's own player; this store tracks what's playing and
 * shows it in the floating mini player. Session-scoped, in memory.
 */

type State = {
  track: MusicTrack | null
  playing: boolean
  error: string | null
  /** Bumped when a sign-in changes so the UI re-reads isConnected(). */
  connectionsVersion: number
}

let state: State = {
  track: null,
  playing: false,
  error: null,
  connectionsVersion: 0,
}
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = {...state, ...patch}
  listeners.forEach(l => l())
}

export function useMusic() {
  return useSyncExternalStore(
    l => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => state,
    () => state,
  )
}

export function notifyConnectionsChanged() {
  set({connectionsVersion: state.connectionsVersion + 1})
}

const wired = new Set<MusicProviderId>()
function wire(id: MusicProviderId) {
  if (wired.has(id)) return
  wired.add(id)
  PROVIDERS[id].onPlayingChange(playing => {
    if (state.track?.provider === id) set({playing})
  })
}

function messageFor(err: unknown) {
  if (err instanceof MusicError) {
    if (err.code === 'premium')
      return 'O Spotify Premium é necessário para tocar aqui.'
    if (err.code === 'not-connected')
      return 'Conecte o serviço de música de novo.'
    if (err.code === 'not-configured')
      return 'Este serviço ainda não está configurado.'
  }
  return 'Não foi possível tocar esta música.'
}

export async function playTrack(track: MusicTrack) {
  const provider = PROVIDERS[track.provider]
  wire(track.provider)
  // Only one source at a time: pause whatever music was playing elsewhere.
  if (state.track && state.track.provider !== track.provider) {
    await PROVIDERS[state.track.provider].pause().catch(() => {})
  }
  set({track, playing: false, error: null})
  try {
    await provider.play(track)
    set({playing: true})
    openMiniPlayer({
      uri: track.uri,
      did: '',
      rkey: '',
      title: track.title,
      author: track.artist,
      thumbnail: track.artwork,
      playlist: '',
      time: 0,
      kind: 'audio',
      external: true,
    })
  } catch (err) {
    set({track: null, playing: false, error: messageFor(err)})
  }
}

export async function toggleMusic() {
  const track = state.track
  if (!track) return
  const provider = PROVIDERS[track.provider]
  try {
    if (state.playing) await provider.pause()
    else await provider.resume()
  } catch (err) {
    set({error: messageFor(err)})
  }
}

export function stopMusic() {
  const track = state.track
  set({track: null, playing: false})
  if (track) PROVIDERS[track.provider].pause().catch(() => {})
  if (getViewPlayback().mini?.external) closeMiniPlayer()
}

export function clearMusicError() {
  if (state.error) set({error: null})
}

// A video taking over the mini player ends the music.
subscribePlayback(() => {
  if (state.track && !getViewPlayback().mini?.external) {
    const track = state.track
    set({track: null, playing: false})
    PROVIDERS[track.provider].pause().catch(() => {})
  }
})

/** Test helper. */
export function resetMusic() {
  state = {track: null, playing: false, error: null, connectionsVersion: 0}
  listeners.forEach(l => l())
}
