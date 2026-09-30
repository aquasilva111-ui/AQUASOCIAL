import {apple} from './apple'
import {spotify} from './spotify'
import {type MusicProvider, type MusicProviderId} from './types'

export const PROVIDERS: Record<MusicProviderId, MusicProvider> = {
  spotify,
  apple,
}
export const PROVIDER_LIST: MusicProvider[] = [spotify, apple]
export * from './types'
