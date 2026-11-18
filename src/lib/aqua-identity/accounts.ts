import {isDid} from './did'
import {type KeyValueStore} from './storage'
import {type AquaIdentityAccount} from './types'

export const DURABLE_KEY = 'aqua-identity.accounts.v1'
export const EPHEMERAL_KEY = 'aqua-identity.pds-session.v1'

const FORBIDDEN_DURABLE = [
  '"password"',
  '"accessjwt"',
  '"refreshjwt"',
  '"apppassword"',
  '"access_token"',
  '"refresh_token"',
]

export type DurableState = {
  accounts: AquaIdentityAccount[]
  currentDid?: string
}

export function assertDurableJson(json: string): void {
  const lowered = json.toLowerCase()
  for (const token of FORBIDDEN_DURABLE) {
    if (lowered.includes(token)) {
      throw new Error('refusing to persist identity secrets')
    }
  }
}

export function upsertAccount(
  state: DurableState,
  account: AquaIdentityAccount,
): DurableState {
  if (!isDid(account.did)) throw new Error('account key must be a DID')
  const accounts = state.accounts.filter(item => item.did !== account.did)
  accounts.push(sanitizeAccount(account))
  return {accounts, currentDid: account.did}
}

export function sanitizeAccount(
  account: AquaIdentityAccount,
): AquaIdentityAccount {
  return {
    did: account.did,
    handle: account.handle,
    pdsUrl: account.pdsUrl,
    method: account.method,
    ...(account.email ? {email: account.email} : {}),
    ...(account.emailConfirmed !== undefined
      ? {emailConfirmed: account.emailConfirmed}
      : {}),
  }
}

export function readDurable(storage: KeyValueStore): DurableState {
  const raw = storage.get(DURABLE_KEY)
  if (!raw) return {accounts: []}
  try {
    assertDurableJson(raw)
    const parsed = JSON.parse(raw) as DurableState
    const accounts = (parsed.accounts ?? [])
      .filter(account => account && isDid(account.did))
      .map(account => sanitizeAccount(account))
    return {accounts, currentDid: parsed.currentDid}
  } catch {
    return {accounts: []}
  }
}

export function writeDurable(storage: KeyValueStore, state: DurableState) {
  const json = JSON.stringify({
    accounts: state.accounts.map(sanitizeAccount),
    currentDid: state.currentDid,
  })
  assertDurableJson(json)
  storage.set(DURABLE_KEY, json)
}

export type EphemeralPdsSession = {
  did: string
  accessJwt: string
  refreshJwt?: string
}

export function saveEphemeralPdsSession(
  storage: KeyValueStore,
  session: EphemeralPdsSession,
) {
  const json = JSON.stringify({
    did: session.did,
    accessJwt: session.accessJwt,
    ...(session.refreshJwt ? {refreshJwt: session.refreshJwt} : {}),
  })
  if (json.toLowerCase().includes('"password"')) {
    throw new Error('refusing to store a password')
  }
  storage.set(EPHEMERAL_KEY, json)
}

export function readEphemeralPdsSession(
  storage: KeyValueStore,
): EphemeralPdsSession | undefined {
  const raw = storage.get(EPHEMERAL_KEY)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as EphemeralPdsSession
    if (!parsed.did || !parsed.accessJwt) return undefined
    if (JSON.stringify(parsed).toLowerCase().includes('"password"'))
      return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function clearEphemeralPdsSession(storage: KeyValueStore) {
  storage.remove(EPHEMERAL_KEY)
}
