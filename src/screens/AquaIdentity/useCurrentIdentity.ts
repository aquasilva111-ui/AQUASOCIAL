import {useSyncExternalStore} from 'react'

import {
  getIdentitySnapshot,
  subscribeIdentity,
} from '#/lib/aqua-identity/runtime'
import {type AquaIdentityAccount} from '#/lib/aqua-identity/types'

export function useCurrentIdentity(): AquaIdentityAccount | undefined {
  const state = useSyncExternalStore(
    subscribeIdentity,
    getIdentitySnapshot,
    getIdentitySnapshot,
  )
  return state.accounts.find(account => account.did === state.currentDid)
}
