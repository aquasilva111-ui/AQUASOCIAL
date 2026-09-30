import type * as HlsTypes from 'hls.js'

type CachedPromise<T> = Promise<T> & {value: undefined | T}

/** hls.js, loaded once and shared by the View player and miniplayer. */
export const loadHls = import(
  // @ts-ignore
  'hls.js/dist/hls.min'
).then(mod => mod.default) as CachedPromise<typeof HlsTypes.default>
loadHls.value = undefined
loadHls.then(Hls => {
  loadHls.value = Hls
})

export type HlsInstance = HlsTypes.default
