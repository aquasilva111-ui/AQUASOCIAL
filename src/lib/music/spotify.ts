import {IS_WEB, SPOTIFY_CLIENT_ID} from './config'
import {codeChallenge, randomString} from './pkce'
import {loadScript} from './script'
import {MusicError, type MusicProvider, type MusicTrack} from './types'

const TOKEN_KEY = 'aqua.music.spotify.tokens'
const PKCE_KEY = 'aqua.music.spotify.pkce'
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-top-read',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ')

type Tokens = {access: string; refresh?: string; expiresAt: number}

function redirectUri() {
  return `${window.location.origin}/music`
}

function readTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null
  }
}

function writeTokens(t: Tokens | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: SPOTIFY_CLIENT_ID, ...body}),
  })
  if (!res.ok) throw new MusicError('failed', 'Spotify sign-in failed')
  const json = await res.json()
  return {
    access: json.access_token,
    refresh: json.refresh_token ?? readTokens()?.refresh,
    expiresAt: Date.now() + (json.expires_in - 30) * 1000,
  }
}

async function getToken(): Promise<string> {
  const t = readTokens()
  if (!t) throw new MusicError('not-connected', 'Spotify is not connected')
  if (t.expiresAt > Date.now()) return t.access
  if (!t.refresh) {
    writeTokens(null)
    throw new MusicError('not-connected', 'Spotify session expired')
  }
  const fresh = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: t.refresh,
  })
  writeTokens(fresh)
  return fresh.access
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${await getToken()}`,
      'Content-Type': 'application/json',
    },
  })
  if (res.status === 401) {
    writeTokens(null)
    throw new MusicError('not-connected', 'Spotify session expired')
  }
  if (res.status === 403) {
    throw new MusicError('premium', 'Spotify Premium is required to play here')
  }
  if (!res.ok && res.status !== 204) {
    throw new MusicError('failed', `Spotify error ${res.status}`)
  }
  return res.status === 204 ? null : res.json().catch(() => null)
}

function toTrack(t: any): MusicTrack {
  return {
    provider: 'spotify',
    id: t.id,
    uri: `spotify:${t.id}`,
    title: t.name,
    artist: (t.artists ?? []).map((x: any) => x.name).join(', '),
    artwork: t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url,
  }
}

type SpotifyPlayer = {
  connect(): Promise<boolean>
  disconnect(): void
  pause(): Promise<void>
  resume(): Promise<void>
  activateElement(): Promise<void>
  addListener(ev: string, cb: (arg: any) => void): void
}

let player: SpotifyPlayer | null = null
let deviceId: Promise<string> | null = null
const playingListeners = new Set<(playing: boolean) => void>()

function ensurePlayer(): Promise<string> {
  if (deviceId) return deviceId
  deviceId = new Promise<string>((resolve, reject) => {
    const w = window as any
    w.onSpotifyWebPlaybackSDKReady = () => {
      player = new w.Spotify.Player({
        name: 'AQUA',
        volume: 0.8,
        getOAuthToken: (cb: (t: string) => void) =>
          getToken()
            .then(cb)
            .catch(() => {}),
      }) as SpotifyPlayer
      player.addListener('ready', ({device_id}: {device_id: string}) =>
        resolve(device_id),
      )
      player.addListener('initialization_error', () =>
        reject(new MusicError('failed', 'Spotify player unavailable')),
      )
      player.addListener('authentication_error', () =>
        reject(new MusicError('not-connected', 'Spotify session expired')),
      )
      player.addListener('account_error', () =>
        reject(new MusicError('premium', 'Spotify Premium is required')),
      )
      player.addListener('player_state_changed', (s: any) => {
        const playing = !!s && !s.paused
        playingListeners.forEach(l => l(playing))
      })
      player.connect()
    }
    loadScript('https://sdk.scdn.co/spotify-player.js').catch(reject)
  }).catch(err => {
    deviceId = null
    throw err
  })
  return deviceId
}

export const spotify: MusicProvider = {
  id: 'spotify',
  label: 'Spotify',
  isConfigured: () => IS_WEB && !!SPOTIFY_CLIENT_ID,
  isConnected: () => IS_WEB && !!readTokens(),

  async connect() {
    if (!SPOTIFY_CLIENT_ID) {
      throw new MusicError('not-configured', 'Spotify is not configured')
    }
    const verifier = randomString(96)
    const state = randomString(24)
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({verifier, state}))
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID,
      scope: SCOPES,
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: await codeChallenge(verifier),
      state,
    })
    window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
  },

  async completeRedirect() {
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const raw = sessionStorage.getItem(PKCE_KEY)
    if (!code || !state || !raw) return false
    const saved = JSON.parse(raw) as {verifier: string; state: string}
    if (saved.state !== state) return false
    sessionStorage.removeItem(PKCE_KEY)
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: saved.verifier,
    })
    writeTokens(tokens)
    window.history.replaceState({}, '', url.pathname)
    return true
  },

  async disconnect() {
    player?.disconnect()
    player = null
    deviceId = null
    writeTokens(null)
  },

  async search(query) {
    const json = await api(
      `/search?${new URLSearchParams({q: query, type: 'track', limit: '20'})}`,
    )
    const items: any[] = json?.tracks?.items ?? []
    return items.map(toTrack)
  },

  async topTracks() {
    try {
      const json = await api('/me/top/tracks?time_range=long_term&limit=10')
      return ((json?.items ?? []) as any[]).map(toTrack)
    } catch (err) {
      // 403 here means the session predates the user-top-read scope.
      if (err instanceof MusicError && err.code === 'premium') {
        throw new MusicError('not-connected', 'Reconnect Spotify')
      }
      throw err
    }
  },

  async play(track) {
    const id = await ensurePlayer()
    // Browsers only allow audio after a user gesture; this is called from one.
    await player?.activateElement()
    await api(`/me/player/play?device_id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({uris: [`spotify:track:${track.id}`]}),
    })
  },

  async pause() {
    await player?.pause()
  },
  async resume() {
    await player?.resume()
  },
  onPlayingChange(cb) {
    playingListeners.add(cb)
    return () => {
      playingListeners.delete(cb)
    }
  },
}
