import type * as HlsTypes from 'hls.js'

export type HlsInstance = HlsTypes.default

let pending: Promise<typeof HlsTypes.default> | undefined

/**
 * hls.js, loaded the first time a player actually starts. The shell imports
 * the miniplayer, so a top-level import() would download the player on every
 * page.
 */
export function loadHls(): Promise<typeof HlsTypes.default> {
  if (!pending) {
    pending = import(
      // @ts-ignore
      'hls.js/dist/hls.min'
    ).then(mod => mod.default)
  }
  return pending
}
