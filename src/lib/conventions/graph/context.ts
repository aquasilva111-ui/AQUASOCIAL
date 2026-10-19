import {type ConventionContext} from '#/lib/conventions/types'

/** Stable dimensions only. Session ids are not stored on the convention. */
export function stableContextKeys(
  context: ConventionContext | undefined,
): string[] {
  if (!context) return []
  const keys: string[] = []
  if (context.surface) keys.push(`surface:${context.surface}`)
  if (context.project) keys.push(`project:${context.project}`)
  if (context.community) keys.push(`community:${context.community}`)
  if (context.creator) keys.push(`creator:${context.creator}`)
  if (context.contentType) keys.push(`content-type:${context.contentType}`)
  if (context.timeWindow) keys.push(`time-window:${context.timeWindow}`)
  return keys.slice(0, 8).map(key => key.slice(0, 80))
}
