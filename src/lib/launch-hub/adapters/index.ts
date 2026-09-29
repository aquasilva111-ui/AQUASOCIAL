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
function createIntegrationAdapter(provider: ProviderId): ProviderAdapter {
  return {
    isConfigured: () => integrationBackend.isConfigured(),
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
          : createIntegrationAdapter(id)
    cache.set(id, adapter)
  }
  return adapter
}
