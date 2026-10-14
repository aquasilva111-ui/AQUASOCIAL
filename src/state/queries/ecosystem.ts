import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'

import {
  ECOSYSTEM_CONFIGURED,
  ecosystemApi,
  UNCONFIGURED_CAPABILITIES,
} from '#/lib/ecosystem/api'
import {
  type EcosystemCapabilities,
  type EcosystemResource,
  type ResourceKind,
} from '#/lib/ecosystem/types'
import {useAgent, useSession} from '#/state/session'

export function useEcosystemCapabilities() {
  const agent = useAgent()
  return useQuery<EcosystemCapabilities>({
    queryKey: ['ecosystem-capabilities'],
    queryFn: ({signal}) =>
      ECOSYSTEM_CONFIGURED
        ? ecosystemApi(agent, '/capabilities', {public: true, signal})
        : Promise.resolve(UNCONFIGURED_CAPABILITIES),
    staleTime: 60000,
    retry: false,
  })
}
export function useEcosystemQuery<T>(path: string, enabled = true) {
  const agent = useAgent()
  const {currentAccount} = useSession()
  return useQuery<T>({
    queryKey: ['ecosystem', currentAccount?.did, path],
    queryFn: ({signal}) => ecosystemApi(agent, path, {signal}),
    enabled: ECOSYSTEM_CONFIGURED && !!currentAccount && enabled,
    retry: false,
    staleTime: 15000,
  })
}
export function useEcosystemResources(kind: ResourceKind, query = '') {
  return useEcosystemQuery<{
    resources: EcosystemResource[]
    discoveryConfigured: boolean
    limited: boolean
  }>(`/resources?kind=${kind}&q=${encodeURIComponent(query)}`)
}
export function useEcosystemMutation<T = EcosystemResource>(
  path: string,
  method = 'POST',
) {
  const agent = useAgent()
  const client = useQueryClient()
  const {currentAccount} = useSession()
  return useMutation<T, Error, unknown>({
    mutationFn: body => ecosystemApi(agent, path, {method, body}),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ['ecosystem', currentAccount?.did],
      })
    },
  })
}
