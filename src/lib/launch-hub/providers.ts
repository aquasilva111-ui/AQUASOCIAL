import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DESTINATIONS,
} from '#/lib/launch-hub/destinations'
import {type Provider, type ProviderId} from '#/lib/launch-hub/types'

/**
 * Provider list, derived from the destinations registry (destinations.ts),
 * which is the single place that describes each network. Screens iterate this
 * list and never special-case networks.
 */
export const PROVIDERS: Provider[] = DESTINATIONS

export {CATEGORY_LABELS, CATEGORY_ORDER}

const byId = new Map(PROVIDERS.map(p => [p.id, p]))

export function getProvider(id: ProviderId): Provider {
  const provider = byId.get(id)
  if (!provider) throw new Error(`Unknown Launch Hub provider: ${id}`)
  return provider
}

export function providersByCategory() {
  return CATEGORY_ORDER.map(category => ({
    category,
    label: CATEGORY_LABELS[category],
    providers: PROVIDERS.filter(p => p.category === category),
  })).filter(group => group.providers.length > 0)
}
