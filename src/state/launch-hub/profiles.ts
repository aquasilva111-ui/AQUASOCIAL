import {useMemo} from 'react'
import {useQuery} from '@tanstack/react-query'

import {integrationBackend} from '#/lib/launch-hub/backend'
import {
  type ConnectedAccount,
  type ManagedProfile,
} from '#/lib/launch-hub/types'
import {useProfilesQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {useProfileTypes} from './store'

/**
 * Every destination the user can publish to.
 *
 * AQUA profiles are the accounts already signed in to the app (the existing
 * multi-account session) — no second identity system. External profiles
 * come from the AQUA Integration API once it is configured.
 */
export function useManagedProfiles(): {
  accounts: ConnectedAccount[]
  profiles: ManagedProfile[]
  isLoading: boolean
} {
  const {accounts: sessionAccounts, currentAccount} = useSession()
  const {types} = useProfileTypes()
  const {data, isLoading} = useProfilesQuery({
    handles: sessionAccounts.map(acc => acc.did),
  })
  const external = useQuery({
    queryKey: ['launch-hub', 'connections'],
    enabled: integrationBackend.isConfigured(),
    queryFn: () => integrationBackend.listConnections(),
  })

  return useMemo(() => {
    const accounts: ConnectedAccount[] = []
    const profiles: ManagedProfile[] = []

    for (const session of sessionAccounts) {
      const profile = data?.profiles.find(p => p.did === session.did)
      const status = session.accessJwt ? 'connected' : 'needs_reconnect'
      const isCurrent = session.did === currentAccount?.did
      const accountId = `aqua:${session.did}`
      const key = `aqua:${session.did}`
      accounts.push({
        id: accountId,
        provider: 'aqua',
        label: session.handle,
        status,
        scopes: ['Publicar posts', 'Enviar imagens'],
      })
      profiles.push({
        key,
        provider: 'aqua',
        connectedAccountId: accountId,
        externalProfileId: session.did,
        displayName: profile?.displayName || session.handle,
        handle: session.handle,
        avatar: profile?.avatar,
        type: types[key] ?? 'personal',
        status,
        permissions: ['Publicar posts', 'Enviar imagens'],
        unavailableReason: isCurrent
          ? undefined
          : `Troque para @${session.handle} no seletor de contas para publicar por ela.`,
      })
    }

    if (external.data) {
      accounts.push(...external.data.accounts)
      profiles.push(
        ...external.data.profiles.map(p => ({
          ...p,
          type: types[p.key] ?? p.type,
        })),
      )
    }

    return {accounts, profiles, isLoading}
  }, [sessionAccounts, currentAccount, data, types, external.data, isLoading])
}
