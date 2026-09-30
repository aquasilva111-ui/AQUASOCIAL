export type MusicProviderId = 'spotify' | 'apple'

export type MusicTrack = {
  provider: MusicProviderId
  /** Provider's own id (Spotify track id, Apple catalog song id). */
  id: string
  /** Stable key for the AQUA mini player. */
  uri: string
  title: string
  artist: string
  artwork?: string
}

/**
 * A streaming service the person signs into so music plays inside AQUA
 * (web only). Playback happens in the provider's official player; AQUA never
 * sees the person's password and stores only the provider's session tokens
 * on this device.
 */
export interface MusicProvider {
  id: MusicProviderId
  label: string
  /** False when the app has no client id / developer token configured. */
  isConfigured(): boolean
  isConnected(): boolean
  /** Starts sign-in. Spotify redirects away; Apple opens a popup. */
  connect(): Promise<void>
  /** Finishes a redirect sign-in, if the current URL is its callback. */
  completeRedirect?(): Promise<boolean>
  disconnect(): Promise<void>
  search(query: string): Promise<MusicTrack[]>
  /** The person's most played tracks, when the service offers them. */
  topTracks?(): Promise<MusicTrack[]>
  play(track: MusicTrack): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  onPlayingChange(cb: (playing: boolean) => void): () => void
}

export class MusicError extends Error {
  constructor(
    public code: 'not-configured' | 'not-connected' | 'premium' | 'failed',
    message: string,
  ) {
    super(message)
  }
}
