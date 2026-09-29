/**
 * Data classification and isolation boundaries for the AQUA +18 environment.
 *
 * The rule: nothing classified `adult_*` may feed social surfaces (feed
 * ranking, Discover, search suggestions, notifications, public profiles).
 * These helpers give the codebase one canonical way to namespace +18 data
 * so a stray query key or storage key can never collide with social data.
 */

export type DataClassification =
  | 'shared'
  | 'social'
  | 'adult_private'
  | 'adult_creator'
  | 'adult_public'
  | 'security'

/**
 * Canonical classification of every +18 data domain. Extend here, never
 * inline in components.
 */
export const ADULT_DATA_DOMAINS = {
  'adult.feed': 'adult_private',
  'adult.recommendations': 'adult_private',
  'adult.likes': 'adult_private',
  'adult.watchHistory': 'adult_private',
  'adult.searchHistory': 'adult_private',
  'adult.subscriptions': 'adult_private',
  'adult.purchases': 'adult_private',
  'adult.library': 'adult_private',
  'adult.messages': 'adult_private',
  'adult.creatorRelationships': 'adult_private',
  'adult.liveHistory': 'adult_private',
  'adult.creatorTools': 'adult_creator',
  'adult.catalog': 'adult_public',
} as const satisfies Record<string, DataClassification>

export type AdultDataDomain = keyof typeof ADULT_DATA_DOMAINS

export function classifyDataDomain(domain: string): DataClassification {
  return (
    (ADULT_DATA_DOMAINS as Record<string, DataClassification>)[domain] ??
    'shared'
  )
}

/** React Query keys for +18 data always live under this root segment. */
export const ADULT_QUERY_NAMESPACE = 'adult'

export function adultQueryKey(
  ...parts: (string | number | undefined)[]
): unknown[] {
  return [ADULT_QUERY_NAMESPACE, ...parts]
}

export function isAdultQueryKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === ADULT_QUERY_NAMESPACE
}

/**
 * Guard for query/mutation code: refuses to run when a key that claims to be
 * +18 is not namespaced, and vice versa. Keeps the two caches from mixing.
 */
export function assertAdultQueryKey(key: unknown): void {
  if (!isAdultQueryKey(key)) {
    throw new Error(
      'Adult query keys must start with the "adult" namespace segment.',
    )
  }
}

/** Storage keys (AsyncStorage/MMKV/localStorage) for +18 data. */
export function adultStorageKey(key: string): string {
  return `adult.${key}`
}

export function isAdultStorageKey(key: string): boolean {
  return key.startsWith('adult.')
}

/**
 * Media prefetch guard: +18 thumbnails/metadata may only be fetched after a
 * deliberate, verified entry. Social surfaces must treat this as always
 * false — they never receive an enabled adult context.
 */
export function canLoadAdultMedia(adultAccessEnabled: boolean): boolean {
  return adultAccessEnabled === true
}
