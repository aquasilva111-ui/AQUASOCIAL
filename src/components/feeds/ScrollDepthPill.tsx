import {type AppBskyActorDefs} from '@atproto/api'

/** Web only (see ScrollDepthPill.web.tsx); native keeps the top pill. */
export function ScrollDepthPill(_props: {
  authors: AppBskyActorDefs.ProfileViewBasic[]
  onPress: () => void
  label: string
  text?: string
}): null {
  return null
}
