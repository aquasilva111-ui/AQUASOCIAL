import {logger} from '#/logger'

/**
 * +18 analytics.
 *
 * Events from the adult environment are namespaced (`adult.*`), allowlisted
 * and intentionally NOT forwarded to the generic metrics pipeline yet — data
 * minimization is the default. When a classified pipeline exists, this module
 * becomes the single forwarding point and its privacy review covers every
 * adult event in one place.
 */

const ADULT_EVENT_ALLOWLIST = new Set([
  'adult.session.entered',
  'adult.session.exited',
  'adult.content.viewed',
  'adult.creator.followed',
  'adult.search.performed',
  'adult.subscription.opened',
] as const)

export type AdultAnalyticsEvent =
  typeof ADULT_EVENT_ALLOWLIST extends Set<infer E> ? E : never

/**
 * Metadata is reduced to coarse, non-identifying dimensions. Content URIs,
 * search terms, handles and media URLs must never appear here.
 */
const ALLOWED_METADATA_KEYS = new Set(['surface', 'sourceType'])

function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string> {
  const clean: Record<string, string> = {}
  if (!metadata) return clean
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue
    if (typeof value === 'string' && value.length <= 64) clean[key] = value
  }
  return clean
}

export function logAdultEvent(
  name: AdultAnalyticsEvent,
  metadata?: Record<string, unknown>,
): void {
  if (!ADULT_EVENT_ALLOWLIST.has(name)) return
  logger.debug('adult analytics event', {
    event: name,
    metadata: sanitizeMetadata(metadata),
  })
}
