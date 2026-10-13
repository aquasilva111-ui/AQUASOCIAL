import {describe, expect, it, jest} from '@jest/globals'
import {act, renderHook} from '@testing-library/react-native'

import {
  type Launch,
  type LaunchDestination,
} from '../../src/lib/launch-hub/types'
import {useLaunchApi} from '../../src/state/launch-hub/store'
import {account} from '../../src/storage'

jest.mock('../../src/lib/launch-hub/runner', () => ({
  recoverStaleLaunch: (launch: unknown) => launch,
}))

jest.mock('@bsky.app/react-native-mmkv', () => ({
  MMKV: class MMKVMock {
    _store = new Map<string, string>()

    set(key: string, value: string) {
      this._store.set(key, value)
    }

    getString(key: string) {
      return this._store.get(key)
    }

    delete(key: string) {
      return this._store.delete(key)
    }

    clearAll() {
      this._store.clear()
    }
  },
}))

jest.mock('../../src/state/session', () => ({
  useSession: () => ({currentAccount: {did: 'did:plc:launch-hub-test'}}),
}))

const DID = 'did:plc:launch-hub-test'
const NOW = '2026-10-11T12:00:00.000Z'

function dest(
  partial: Partial<LaunchDestination> &
    Pick<LaunchDestination, 'id' | 'status'>,
): LaunchDestination {
  return {
    launchId: 'pending',
    provider: 'x',
    profileKey: `assistido:${partial.id}`,
    idempotencyKey: 'idem',
    attempts: 0,
    mode: 'assistido',
    updatedAt: NOW,
    ...partial,
  }
}

function makeLaunch(id: string, destinations: LaunchDestination[]): Launch {
  return {
    id,
    creatorDid: DID,
    type: 'social_post',
    contentPackage: {text: 'olá', media: []},
    destinations: destinations.map(d => ({...d, launchId: id})),
    publishMode: 'now',
    status: 'publishing',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function stored(id: string) {
  return account
    .get([DID, 'launchHubLaunches'])
    ?.find(launch => launch.id === id)
}

describe('useLaunchApi().markAssisted', () => {
  it('persists an assisted open as awaiting_user', () => {
    const launch = makeLaunch('open-1', [
      dest({id: 'aqua', provider: 'aqua', status: 'published', mode: 'auto'}),
      dest({id: 'x', status: 'pending'}),
    ])
    const {result} = renderHook(() => useLaunchApi())
    act(() => {
      result.current.saveLaunch(launch)
      result.current.markAssisted(launch.id, 'x', 'abrir')
    })
    const saved = stored(launch.id)
    const x = saved?.destinations.find(d => d.id === 'x')
    expect(x?.status).toBe('opened')
    expect(x?.openedAt).toEqual(expect.any(String))
    expect(saved?.status).toBe('awaiting_user')
    expect(saved?.destinations.find(d => d.id === 'aqua')?.status).toBe(
      'published',
    )
  })

  it('persists published and a failure message', () => {
    const launch = makeLaunch('mark-2', [
      dest({id: 'aqua', provider: 'aqua', status: 'published', mode: 'auto'}),
      dest({
        id: 'x',
        status: 'opened',
        publishedAt: '2026-10-01T00:00:00.000Z',
      }),
      dest({id: 'threads', provider: 'threads', status: 'pending'}),
    ])
    const {result} = renderHook(() => useLaunchApi())
    act(() => {
      result.current.saveLaunch(launch)
      result.current.markAssisted(launch.id, 'x', 'publicado')
      result.current.markAssisted(launch.id, 'threads', 'erro', {
        error: 'Threads não abriu. Confira se o pop-up foi bloqueado.',
      })
    })
    const saved = stored(launch.id)
    const x = saved?.destinations.find(d => d.id === 'x')
    const threads = saved?.destinations.find(d => d.id === 'threads')
    expect(x?.status).toBe('published')
    expect(x?.publishedAt).toBe('2026-10-01T00:00:00.000Z')
    expect(threads?.status).toBe('failed')
    expect(threads?.error).toBe(
      'Threads não abriu. Confira se o pop-up foi bloqueado.',
    )
    expect(saved?.status).toBe('partial')
  })
})
