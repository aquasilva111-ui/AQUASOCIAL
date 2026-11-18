import {
  getPublicProfile,
  searchPublicActors,
  searchPublicPosts,
} from '#/lib/webmcp/public-api'
import {collectModelContexts, registerWebMcpOnLoad} from '#/lib/webmcp/register'
import {type WebMcpDeps} from '#/lib/webmcp/tools'
import {logger} from '#/logger'
import {isWeb} from '#/platform/detection'
import {type FeedDescriptor} from '#/state/queries/post-feed'
import {selectHomeFeed} from '#/state/shell/selected-feed'
import {navigate} from '#/Navigation'

/**
 * Registers the public WebMCP tools as soon as the web bundle loads.
 * Browsers without `navigator.modelContext` or `document.modelContext`
 * skip registration. Failures are logged and never thrown.
 */
export function installWebMcpTools(): void {
  if (!isWeb) return
  try {
    registerWebMcpOnLoad({
      isWeb: true,
      contexts: collectModelContexts(),
      deps: createLiveDeps(),
    }).catch(err => {
      logger.warn('webmcp: registration failed', {
        message: err instanceof Error ? err.message : String(err),
      })
    })
  } catch (err) {
    logger.warn('webmcp: registration failed', {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function createLiveDeps(): WebMcpDeps {
  return {
    searchPosts: (query, options) => searchPublicPosts(query, options),
    searchActors: (query, options) => searchPublicActors(query, options),
    getProfile: (actor, options) => getPublicProfile(actor, options),
    selectHomeFeed(descriptor) {
      selectHomeFeed(descriptor as FeedDescriptor)
    },
    async openRoute(screen, params) {
      await navigate(
        screen as Parameters<typeof navigate>[0],
        params as Parameters<typeof navigate>[1],
      )
    },
  }
}
