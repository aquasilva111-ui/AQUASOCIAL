/**
 * Set these at build time (see docs/aqua-music.md). Without them the
 * matching service shows as "not configured" and can't be connected.
 */
export const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || ''
export const APPLE_MUSIC_DEVELOPER_TOKEN =
  process.env.EXPO_PUBLIC_APPLE_MUSIC_DEVELOPER_TOKEN || ''

export const IS_WEB = typeof window !== 'undefined' && !!window.document
