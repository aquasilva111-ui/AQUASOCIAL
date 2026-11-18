import {
  type DurableState,
  readDurable,
  upsertAccount,
  writeDurable,
} from './accounts'
import {readAquaIdentityConfig} from './config'
import {SlidingWindowRateLimiter} from './rate-limit'
import {localBrowserStore} from './storage'
import {type KeyValueStore} from './storage'
import {type AquaIdentityAccount} from './types'

type Listener = () => void

let store: KeyValueStore = localBrowserStore()
let snapshot: DurableState = {accounts: []}
let loaded = false
const listeners = new Set<Listener>()

export function configureIdentityStore(next: KeyValueStore) {
  store = next
  loaded = false
  snapshot = {accounts: []}
}

export function getIdentitySnapshot(): DurableState {
  if (!loaded) {
    loaded = true
    snapshot = readDurable(store)
  }
  return snapshot
}

export function subscribeIdentity(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function rememberAccount(account: AquaIdentityAccount): DurableState {
  const next = upsertAccount(getIdentitySnapshot(), account)
  writeDurable(store, next)
  snapshot = next
  for (const listener of listeners) listener()
  return next
}

export function currentIdentity(): AquaIdentityAccount | undefined {
  const state = getIdentitySnapshot()
  return state.accounts.find(account => account.did === state.currentDid)
}

export function updateCurrentHandle(handle: string) {
  const current = currentIdentity()
  if (!current) return
  rememberAccount({...current, handle})
}

export function markEmailConfirmed(confirmed: boolean) {
  const current = currentIdentity()
  if (!current) return
  rememberAccount({...current, emailConfirmed: confirmed})
}

let attempts: SlidingWindowRateLimiter | undefined

export function attemptLimiter(): SlidingWindowRateLimiter {
  if (!attempts) {
    attempts = new SlidingWindowRateLimiter(readAquaIdentityConfig().limits)
  }
  return attempts
}
