import {
  canonicalPublicFeed,
  normalizeActor,
  PRA_VOCE_FEED_DESCRIPTOR,
  PUBLIC_FEEDS,
  publicFeedPath,
  resolvePublicRoute,
} from '#/lib/webmcp/navigation'
import {
  type PublicActor,
  type PublicApiResult,
  type PublicPost,
} from '#/lib/webmcp/public-api'
import {type WebMcpTool} from '#/lib/webmcp/types'

const QUERY_LIMIT = 300

export type WebMcpDeps = {
  searchPosts: (
    query: string,
    options: {limit: number; sort: 'top' | 'latest'; signal?: AbortSignal},
  ) => Promise<PublicApiResult<PublicPost[]>>
  searchActors: (
    query: string,
    options: {limit: number; signal?: AbortSignal},
  ) => Promise<PublicApiResult<PublicActor[]>>
  getProfile: (
    actor: string,
    options: {signal?: AbortSignal},
  ) => Promise<PublicApiResult<PublicActor>>
  openRoute: (screen: string, params: Record<string, string>) => Promise<void>
  selectHomeFeed: (descriptor: string) => void
}

export const WEB_MCP_TOOL_NAMES = [
  'search_posts',
  'search_users',
  'open_profile',
  'open_feed',
  'navigate_to',
] as const

export function buildWebMcpTools(deps: WebMcpDeps): WebMcpTool[] {
  return [
    {
      name: 'search_posts',
      title: 'Search posts',
      description:
        'Search public posts on the Aqua AppView. Read-only, and it does not use the signed-in account.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            minLength: 1,
            maxLength: QUERY_LIMIT,
            description: 'Words to find in public posts.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 25,
            default: 8,
            description: 'How many posts to return.',
          },
          sort: {
            type: 'string',
            enum: ['top', 'latest'],
            default: 'latest',
            description: 'Rank by relevance or by time.',
          },
        },
      },
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: (input, options) =>
        guard(() => executeSearchPosts(deps, input, options?.signal)),
    },
    {
      name: 'search_users',
      title: 'Search users',
      description:
        'Search public profiles on the Aqua AppView. Read-only, and it does not use the signed-in account.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            minLength: 1,
            maxLength: QUERY_LIMIT,
            description: 'Name or handle to find.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 25,
            default: 8,
            description: 'How many profiles to return.',
          },
        },
      },
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: (input, options) =>
        guard(() => executeSearchUsers(deps, input, options?.signal)),
    },
    {
      name: 'open_profile',
      title: 'Open profile',
      description: 'Open a public profile by handle or DID.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['actor'],
        properties: {
          actor: {
            type: 'string',
            minLength: 1,
            maxLength: 253,
            description: 'Handle or DID of the profile to open.',
          },
        },
      },
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: (input, options) =>
        guard(() => executeOpenProfile(deps, input, options?.signal)),
    },
    {
      name: 'open_feed',
      title: 'Open feed',
      description:
        'Open a public feed. pra-voce is the home Pra você feed. books opens /books.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['feed'],
        properties: {
          feed: {
            type: 'string',
            enum: [...PUBLIC_FEEDS],
            description:
              'Public feed. pra-voce is the home Pra você feed, and books is /books.',
          },
        },
      },
      annotations: {readOnlyHint: true},
      execute: input => guard(() => executeOpenFeed(deps, input)),
    },
    {
      name: 'navigate_to',
      title: 'Navigate',
      description:
        'Open a public in-app path. Messages, settings, notifications, moderation, adult, and compose pages stay closed.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            description:
              'In-app path, such as /search or /profile/example.com.',
          },
        },
      },
      annotations: {readOnlyHint: true},
      execute: input => guard(() => executeNavigate(deps, input)),
    },
  ]
}

async function executeSearchPosts(
  deps: WebMcpDeps,
  input: unknown,
  signal?: AbortSignal,
) {
  const parsed = readInput(input)
  if ('error' in parsed) return parsed
  const query = readQuery(parsed.query)
  if (typeof query !== 'string') return query
  const limit = readLimit(parsed.limit)
  if (typeof limit !== 'number') return limit
  const sort = readSort(parsed.sort)
  if (typeof sort !== 'string') return sort
  const result = await deps.searchPosts(query, {limit, sort, signal})
  if (!result.ok) return {error: result.error}
  return {posts: result.value}
}

async function executeSearchUsers(
  deps: WebMcpDeps,
  input: unknown,
  signal?: AbortSignal,
) {
  const parsed = readInput(input)
  if ('error' in parsed) return parsed
  const query = readQuery(parsed.query)
  if (typeof query !== 'string') return query
  const limit = readLimit(parsed.limit)
  if (typeof limit !== 'number') return limit
  const result = await deps.searchActors(query, {limit, signal})
  if (!result.ok) return {error: result.error}
  return {actors: result.value}
}

async function executeOpenProfile(
  deps: WebMcpDeps,
  input: unknown,
  signal?: AbortSignal,
) {
  const parsed = readInput(input)
  if ('error' in parsed) return parsed
  if (typeof parsed.actor !== 'string') {
    return {error: 'A handle or DID is required.'}
  }
  const actor = normalizeActor(parsed.actor)
  if (typeof actor !== 'string') return actor
  const route = resolvePublicRoute(`/profile/${actor}`)
  if (!route.ok) return {error: route.error}
  const profilePromise = deps.getProfile(actor, {signal})
  await deps.openRoute(route.route.screen, route.route.params)
  const profile = await profilePromise
  return {
    opened: true,
    path: route.route.path,
    profile: profile.ok ? profile.value : null,
    ...(profile.ok ? {} : {warning: profile.error}),
  }
}

async function executeOpenFeed(deps: WebMcpDeps, input: unknown) {
  const parsed = readInput(input)
  if ('error' in parsed) return parsed
  if (typeof parsed.feed !== 'string') {
    return {error: 'A public feed name is required.'}
  }
  const feed = canonicalPublicFeed(parsed.feed)
  if (!feed) {
    return {
      error:
        'That feed is not public. Pra você and /books are. Following, messages, and settings are not.',
    }
  }
  if (feed === 'pra-voce') {
    deps.selectHomeFeed(PRA_VOCE_FEED_DESCRIPTOR)
  }
  const route = resolvePublicRoute(publicFeedPath(feed))
  if (!route.ok) return {error: route.error}
  await deps.openRoute(route.route.screen, route.route.params)
  return {
    opened: true,
    feed,
    path: route.route.path,
    ...(feed === 'pra-voce' ? {feedDescriptor: PRA_VOCE_FEED_DESCRIPTOR} : {}),
  }
}

async function executeNavigate(deps: WebMcpDeps, input: unknown) {
  const parsed = readInput(input)
  if ('error' in parsed) return parsed
  if (typeof parsed.path !== 'string') {
    return {error: 'A path is required.'}
  }
  const route = resolvePublicRoute(parsed.path)
  if (!route.ok) return {error: route.error}
  await deps.openRoute(route.route.screen, route.route.params)
  return {opened: true, path: route.route.path, screen: route.route.screen}
}

function readInput(input: unknown): Record<string, unknown> | {error: string} {
  if (typeof input === 'string') {
    try {
      return readInput(JSON.parse(input))
    } catch {
      return {error: 'Input is not valid JSON.'}
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {error: 'Input must be an object.'}
  }
  return input as Record<string, unknown>
}

function readQuery(value: unknown): string | {error: string} {
  if (typeof value !== 'string') return {error: 'Query is required.'}
  const query = value.trim()
  if (!query) return {error: 'Query is empty.'}
  if (query.length > QUERY_LIMIT) return {error: 'Query is too long.'}
  return query
}

function readLimit(value: unknown): number | {error: string} {
  if (value === undefined) return 8
  const limit = typeof value === 'number' ? value : Number.NaN
  if (!Number.isInteger(limit)) return {error: 'Limit must be a whole number.'}
  return Math.min(25, Math.max(1, limit))
}

function readSort(value: unknown): 'top' | 'latest' | {error: string} {
  if (value === undefined) return 'latest'
  if (value === 'top' || value === 'latest') return value
  return {error: 'Sort must be top or latest.'}
}

async function guard(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run()
  } catch {
    return {error: 'The tool failed.'}
  }
}
