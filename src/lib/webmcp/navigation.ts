import {DISCOVER_FEED_URI} from '#/lib/constants'
import {router} from '#/routes'

/**
 * Home "Pra você" / For You. Same descriptor the home pager already pins
 * for logged-out visitors.
 */
export const PRA_VOCE_FEED_DESCRIPTOR = `feedgen|${DISCOVER_FEED_URI}`

export const PUBLIC_FEEDS = [
  'pra-voce',
  'books',
  'search',
  'feeds',
  'views',
  'music',
  'noticias',
  'wiki',
  'reads',
] as const

export type PublicFeedId = (typeof PUBLIC_FEEDS)[number]

const FEED_PATHS: Record<PublicFeedId, string> = {
  'pra-voce': '/',
  books: '/books',
  search: '/search',
  feeds: '/feeds',
  views: '/views',
  music: '/music',
  noticias: '/noticias',
  wiki: '/wiki',
  reads: '/reads',
}

export const FEED_LABELS: Record<PublicFeedId, string> = {
  'pra-voce': 'Pra você',
  books: 'Books',
  search: 'Search',
  feeds: 'Feeds',
  views: 'Views',
  music: 'Music',
  noticias: 'Notícias',
  wiki: 'Wiki',
  reads: 'Reads',
}

const FEED_ALIASES: Record<string, PublicFeedId> = {
  'pra-voce': 'pra-voce',
  'para-voce': 'pra-voce',
  'pra voce': 'pra-voce',
  'para voce': 'pra-voce',
  'for-you': 'pra-voce',
  'for you': 'pra-voce',
  discover: 'pra-voce',
  'whats-hot': 'pra-voce',
  'whats hot': 'pra-voce',
  books: 'books',
  escrever: 'books',
  write: 'books',
  search: 'search',
  busca: 'search',
  feeds: 'feeds',
  views: 'views',
  videos: 'views',
  music: 'music',
  musica: 'music',
  noticias: 'noticias',
  news: 'noticias',
  wiki: 'wiki',
  reads: 'reads',
  leitura: 'reads',
}

/**
 * Screens an agent may open. Anything that posts, deletes, messages, edits,
 * or shows private account state is absent on purpose.
 */
export const PUBLIC_ROUTE_NAMES = [
  'Home',
  'Search',
  'Feeds',
  'Books',
  'Reads',
  'Music',
  'NewsAtlas',
  'WikiHome',
  'BookDetail',
  'BookChapter',
  'WriteRead',
  'Profile',
  'ProfileFollowers',
  'ProfileFollows',
  'ProfileKnownFollowers',
  'ProfileSearch',
  'ProfileList',
  'PostThread',
  'PostLikedBy',
  'PostRepostedBy',
  'PostQuotes',
  'ProfileFeed',
  'ProfileFeedLikedBy',
  'ProfileLabelerLikedBy',
  'Hashtag',
  'Topic',
  'Support',
  'PrivacyPolicy',
  'TermsOfService',
  'CommunityGuidelines',
  'CopyrightPolicy',
  'Images',
  'ImagesLegacy',
  'ImageDetail',
  'ImageDetailLegacy',
  'Videos',
  'VideosLegacy',
  'VideoWatch',
  'VideoWatchLegacy',
  'ViewChannel',
  'ViewChannelLegacy',
  'ViewChannels',
  'ViewLive',
  'VideoLive',
  'Drops',
  'StarterPack',
  'StarterPackShort',
  'Start',
  'VideoFeed',
] as const

const PUBLIC_ROUTE_SET = new Set<string>(PUBLIC_ROUTE_NAMES)

const SITE_ORIGIN = 'https://aquaapp.systems'
const PRIVATE_PATH =
  'That page is private or can change data, so it is not available.'

export type ResolvedRoute = {
  screen: string
  params: Record<string, string>
  path: string
}

export function canonicalPublicFeed(input: string): PublicFeedId | null {
  const key = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
  return FEED_ALIASES[key] ?? null
}

export function publicFeedPath(feed: PublicFeedId): string {
  return FEED_PATHS[feed]
}

export function resolvePublicRoute(
  input: string,
): {ok: true; route: ResolvedRoute} | {ok: false; error: string} {
  const normalized = normalizeAppPath(input)
  if (!normalized.ok) return normalized
  const [screen, params] = router.matchPath(normalized.path)
  if (!PUBLIC_ROUTE_SET.has(screen)) {
    return {ok: false, error: PRIVATE_PATH}
  }
  return {
    ok: true,
    route: {screen, params, path: normalized.path},
  }
}

export function normalizeActor(input: string): string | {error: string} {
  const actor = input.trim().replace(/^@/, '')
  if (!actor) return {error: 'A handle or DID is required.'}
  if (actor.length > 253 || /[\s/?#\\]/.test(actor)) {
    return {error: 'That handle or DID is not valid.'}
  }
  if (actor.startsWith('did:')) {
    if (!/^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/.test(actor)) {
      return {error: 'That DID is not valid.'}
    }
    return actor
  }
  if (
    !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
      actor,
    )
  ) {
    return {error: 'That handle is not valid.'}
  }
  return actor
}

function normalizeAppPath(
  input: string,
): {ok: true; path: string} | {ok: false; error: string} {
  const trimmed = input.trim()
  if (!trimmed) return {ok: false, error: 'Path is empty.'}
  if (trimmed.length > 500) return {ok: false, error: 'Path is too long.'}
  if (trimmed.startsWith('//') || trimmed.includes('\\')) {
    return {ok: false, error: 'Only pages on this site can be opened.'}
  }

  let url: URL
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      url = new URL(trimmed)
      const allowed = new Set([SITE_ORIGIN])
      if (typeof location !== 'undefined' && location.origin) {
        allowed.add(location.origin)
      }
      if (!allowed.has(url.origin)) {
        return {ok: false, error: 'Only pages on this site can be opened.'}
      }
    } else if (!trimmed.startsWith('/')) {
      return {ok: false, error: 'Path must start with /.'}
    } else {
      url = new URL(trimmed, SITE_ORIGIN)
    }
  } catch {
    return {ok: false, error: 'Path is not valid.'}
  }

  if (url.username || url.password) {
    return {ok: false, error: 'Path is not valid.'}
  }
  return {ok: true, path: `${url.pathname}${url.search}`}
}
