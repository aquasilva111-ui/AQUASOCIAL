import {useQuery} from '@tanstack/react-query'

import {
  STREAMPLACE_NODE,
  type StreamplaceLivestreamView,
} from '#/lib/streamplace'

export const RQKEY = ['streamplace-live-users']

/**
 * Live broadcasts currently streaming on the Streamplace node
 * (`place.stream.live.getLiveUsers`).
 */
export function useLiveUsersQuery({enabled = true}: {enabled?: boolean} = {}) {
  return useQuery<StreamplaceLivestreamView[]>({
    queryKey: RQKEY,
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    async queryFn() {
      const res = await fetch(
        `${STREAMPLACE_NODE}/xrpc/place.stream.live.getLiveUsers?limit=50`,
      )
      if (!res.ok) {
        throw new Error(`getLiveUsers failed: ${res.status}`)
      }
      const json = await res.json()
      return (json.streams ?? []) as StreamplaceLivestreamView[]
    },
  })
}
