import {type MediaAsset} from '#/lib/launch-hub/types'

/**
 * Browser-picked media arrives as data:/blob: URLs, which are too large for
 * device storage and die with the tab. Those stay here, in memory, keyed by
 * asset id; everything else is persisted on the asset itself.
 */
const memory = new Map<string, string>()

export function isEphemeralUri(uri: string) {
  return uri.startsWith('data:') || uri.startsWith('blob:')
}

/** Returns the asset as it should be persisted. */
export function rememberAssetUri(asset: MediaAsset, uri: string): MediaAsset {
  if (isEphemeralUri(uri)) {
    memory.set(asset.id, uri)
    return {...asset, uri: undefined}
  }
  return {...asset, uri}
}

export function resolveAssetUri(asset: MediaAsset): string | undefined {
  return asset.uri ?? memory.get(asset.id)
}
