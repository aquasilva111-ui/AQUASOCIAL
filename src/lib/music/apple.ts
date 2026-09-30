import {APPLE_MUSIC_DEVELOPER_TOKEN, IS_WEB} from './config'
import {loadScript} from './script'
import {MusicError, type MusicProvider, type MusicTrack} from './types'

let instance: Promise<any> | null = null
const playingListeners = new Set<(playing: boolean) => void>()

function getInstance(): Promise<any> {
  if (instance) return instance
  instance = (async () => {
    if (!APPLE_MUSIC_DEVELOPER_TOKEN) {
      throw new MusicError('not-configured', 'Apple Music is not configured')
    }
    const w = window as any
    if (!w.MusicKit) {
      await new Promise<void>((resolve, reject) => {
        document.addEventListener('musickitloaded', () => resolve(), {
          once: true,
        })
        loadScript(
          'https://js-cdn.music.apple.com/musickit/v3/musickit.js',
        ).catch(reject)
      })
    }
    await w.MusicKit.configure({
      developerToken: APPLE_MUSIC_DEVELOPER_TOKEN,
      app: {name: 'AQUA', build: '1.0'},
    })
    const mk = w.MusicKit.getInstance()
    mk.addEventListener('playbackStateDidChange', () => {
      const playing = mk.playbackState === w.MusicKit.PlaybackStates.playing
      playingListeners.forEach(l => l(playing))
    })
    return mk
  })().catch(err => {
    instance = null
    throw err
  })
  return instance
}

// MusicKit reports authorization synchronously only after it has loaded.
let authorized = false
try {
  authorized = IS_WEB && localStorage.getItem('aqua.music.apple') === '1'
} catch {}

function artwork(url?: string) {
  return url?.replace('{w}', '300').replace('{h}', '300')
}

export const apple: MusicProvider = {
  id: 'apple',
  label: 'Apple Music',
  isConfigured: () => IS_WEB && !!APPLE_MUSIC_DEVELOPER_TOKEN,
  isConnected: () => authorized,

  async connect() {
    const mk = await getInstance()
    await mk.authorize()
    authorized = !!mk.isAuthorized
    try {
      localStorage.setItem('aqua.music.apple', authorized ? '1' : '0')
    } catch {}
    if (!authorized)
      throw new MusicError('failed', 'Apple Music sign-in cancelled')
  },

  async disconnect() {
    const mk = await getInstance()
    await mk.unauthorize().catch(() => {})
    authorized = false
    try {
      localStorage.removeItem('aqua.music.apple')
    } catch {}
  },

  async search(query) {
    const mk = await getInstance()
    const res = await mk.api.music(
      `/v1/catalog/${mk.storefrontId || 'us'}/search`,
      {term: query, types: 'songs', limit: 20},
    )
    const songs: any[] = res?.data?.results?.songs?.data ?? []
    return songs.map(s => ({
      provider: 'apple' as const,
      id: s.id,
      uri: `apple:${s.id}`,
      title: s.attributes?.name ?? '',
      artist: s.attributes?.artistName ?? '',
      artwork: artwork(s.attributes?.artwork?.url),
    })) satisfies MusicTrack[]
  },

  async play(track) {
    const mk = await getInstance()
    if (!mk.isAuthorized) {
      throw new MusicError('not-connected', 'Apple Music is not connected')
    }
    await mk.setQueue({song: track.id})
    await mk.play()
  },

  async pause() {
    const mk = await getInstance()
    mk.pause()
  },
  async resume() {
    const mk = await getInstance()
    await mk.play()
  },
  onPlayingChange(cb) {
    playingListeners.add(cb)
    return () => {
      playingListeners.delete(cb)
    }
  },
}
