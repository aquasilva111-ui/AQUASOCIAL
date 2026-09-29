import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {recoverStaleLaunch} from '#/lib/launch-hub/runner'
import {
  type IdentityGroup,
  type Launch,
  type ProfileType,
} from '#/lib/launch-hub/types'
import {useSession} from '#/state/session'
import {account} from '#/storage'

type Values = {
  launchHubLaunches: Launch[]
  launchHubIdentityGroups: IdentityGroup[]
  launchHubProfileTypes: Record<string, ProfileType>
}
type Key = keyof Values

const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Snapshots are cached per key so useSyncExternalStore sees a stable value
 * between writes.
 */
const snapshots = new Map<string, unknown>()

function read<K extends Key>(did: string, key: K) {
  const id = `${did}:${key}`
  if (!snapshots.has(id)) snapshots.set(id, account.get([did, key]))
  return snapshots.get(id) as Values[K] | undefined
}

function write<K extends Key>(did: string, key: K, value: Values[K]) {
  account.set([did, key], value)
  snapshots.set(`${did}:${key}`, value)
  emit()
}

function useStored<K extends Key>(did: string | undefined, key: K) {
  return useSyncExternalStore(subscribe, () =>
    did ? read(did, key) : undefined,
  )
}

export function useLaunches(): Launch[] {
  const {currentAccount} = useSession()
  const launches = useStored(currentAccount?.did, 'launchHubLaunches')
  return useMemo(
    () =>
      (launches ?? [])
        .map(launch => recoverStaleLaunch(launch))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [launches],
  )
}

export function useLaunch(id: string): Launch | undefined {
  return useLaunches().find(launch => launch.id === id)
}

export function useLaunchApi() {
  const {currentAccount} = useSession()
  const did = currentAccount?.did

  const saveLaunch = useCallback(
    (launch: Launch) => {
      if (!did) return
      const others = (read(did, 'launchHubLaunches') ?? []).filter(
        l => l.id !== launch.id,
      )
      write(did, 'launchHubLaunches', [launch, ...others])
    },
    [did],
  )

  /** Reads the latest stored launch, so concurrent job updates don't clobber. */
  const updateLaunch = useCallback(
    (id: string, update: (launch: Launch) => Launch) => {
      if (!did) return
      const launches = read(did, 'launchHubLaunches') ?? []
      write(
        did,
        'launchHubLaunches',
        launches.map(l => (l.id === id ? update(l) : l)),
      )
    },
    [did],
  )

  const removeLaunch = useCallback(
    (id: string) => {
      if (!did) return
      write(
        did,
        'launchHubLaunches',
        (read(did, 'launchHubLaunches') ?? []).filter(l => l.id !== id),
      )
    },
    [did],
  )

  return {saveLaunch, updateLaunch, removeLaunch}
}

export function useIdentityGroups() {
  const {currentAccount} = useSession()
  const did = currentAccount?.did
  const groups = useStored(did, 'launchHubIdentityGroups')

  const saveGroup = useCallback(
    (group: IdentityGroup) => {
      if (!did) return
      const others = (read(did, 'launchHubIdentityGroups') ?? []).filter(
        g => g.id !== group.id,
      )
      write(did, 'launchHubIdentityGroups', [...others, group])
    },
    [did],
  )

  const removeGroup = useCallback(
    (id: string) => {
      if (!did) return
      write(
        did,
        'launchHubIdentityGroups',
        (read(did, 'launchHubIdentityGroups') ?? []).filter(g => g.id !== id),
      )
    },
    [did],
  )

  return {groups: groups ?? [], saveGroup, removeGroup}
}

export function useProfileTypes() {
  const {currentAccount} = useSession()
  const did = currentAccount?.did
  const types = useStored(did, 'launchHubProfileTypes')

  const setProfileType = useCallback(
    (profileKey: string, type: ProfileType) => {
      if (!did) return
      write(did, 'launchHubProfileTypes', {
        ...read(did, 'launchHubProfileTypes'),
        [profileKey]: type,
      })
    },
    [did],
  )

  return {types: types ?? {}, setProfileType}
}
