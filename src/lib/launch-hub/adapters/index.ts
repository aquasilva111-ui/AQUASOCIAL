import {integrationBackend} from '#/lib/launch-hub/backend'
import {getProvider} from '#/lib/launch-hub/providers'
import {type ProviderId} from '#/lib/launch-hub/types'
import {atprotoAdapter} from './atproto'
import {type ProviderAdapter} from './types'

export type {
  AdapterContext,
  DestinationPreview,
  ProviderAdapter,
  PublishJob,
  PublishResult,
} from './types'

/**
 * External providers go through the AQUA Integration API, which holds the
 * credentials and runs the jobs server-side. Capabilities come from that
 * backend per profile (scopes/account type), so none are declared here.
 */
function createIntegrationAdapter(
  provider: ProviderId,
  hasApi = true,
): ProviderAdapter {
  return {
    // `none`: no API at all (assisted only), never configured
    isConfigured: () => hasApi && integrationBackend.isConfigured(),
    connect: () => integrationBackend.beginConnect(provider),
    disconnect: account => integrationBackend.disconnect(account.id),
    getCapabilities: () => null,
    validateContent: () => [],
    renderPreview: () => null,
    async publish({launch, destination}) {
      await integrationBackend.enqueue(launch, [destination.id])
      return {queued: true}
    },
    async schedule({launch, destination}) {
      await integrationBackend.enqueue(launch, [destination.id])
    },
  }
}

const cache = new Map<ProviderId, ProviderAdapter>()

export function getAdapter(id: ProviderId): ProviderAdapter {
  let adapter = cache.get(id)
  if (!adapter) {
    const provider = getProvider(id)
    adapter =
      provider.adapter === 'atproto-session'
        ? atprotoAdapter
        : provider.adapter === 'same-network' && provider.sameNetworkAs
          ? getAdapter(provider.sameNetworkAs)
          : createIntegrationAdapter(id, provider.adapter !== 'none')
    cache.set(id, adapter)
  }
  return adapter
}
