import {useCallback, useMemo} from 'react'
import {useSyncExternalStore} from 'react'

import {clearAdultActionHistory} from '#/state/adult/actionHistory'
import {
  clearAdultEntered,
  getAdultEntry,
  markAdultEntered,
  subscribeAdultEntry,
} from '#/state/adult/entered'
import {
  type AdultAgeGateStatus,
  isAdultAccessGranted,
  resolveAdultAgeGate,
} from '#/state/adult/gate'
import {useSession} from '#/state/session'
import {useAgeAssurance} from '#/ageAssurance'

/**
 * Minimal identity projection exposed to the +18 environment. The adult
 * surface receives only what it needs — the underlying AQUA account stays
 * the single identity (no AdultUser, no second login). Rich profile fields
 * (displayName, avatar) resolve through the normal profile queries when a
 * surface needs them.
 */
export type AdultIdentity = {
  did: string
  handle: string
}

/**
 * Contract only — distinguishes roles inside +18. Everyone is a viewer until
 * the creator pipeline (FASE 6+) upgrades this from real server state.
 */
export type AdultCreatorStatus = 'viewer' | 'creator' | 'studio' | 'moderator'

export type AdultContextValue = {
  identity: AdultIdentity | null
  ageGateStatus: AdultAgeGateStatus
  /** True only when the gate is verified AND the user deliberately entered. */
  adultAccessEnabled: boolean
  /** Whether the gate alone would allow entry (pre-confirmation). */
  canEnter: boolean
  creatorStatus: AdultCreatorStatus
  enteredAt: string | null
  enter: () => void
  exit: () => void
}

/**
 * THE +18 CONTEXT HOOK.
 *
 * Composed from the existing providers (session + age assurance) plus the
 * in-memory entry record, so it needs no provider of its own and can never
 * outlive the AQUA session: an expired session or account switch makes
 * `identity` null and closes the gate everywhere at once.
 */
export function useAdultContext(): AdultContextValue {
  const {currentAccount, hasSession} = useSession()
  const {state: ageAssuranceState} = useAgeAssurance()
  const entry = useSyncExternalStore(subscribeAdultEntry, getAdultEntry)

  const identity = useMemo<AdultIdentity | null>(
    () =>
      currentAccount
        ? {
            did: currentAccount.did,
            handle: currentAccount.handle,
          }
        : null,
    [currentAccount],
  )

  const ageGateStatus = resolveAdultAgeGate(hasSession, ageAssuranceState)
  const entered = identity !== null && entry?.did === identity.did
  const canEnter = ageGateStatus === 'verified' && identity !== null
  const adultAccessEnabled =
    identity !== null && isAdultAccessGranted(ageGateStatus, entered)

  const enter = useCallback(() => {
    // Fail closed: refuse to mark entry unless the gate is verified right now.
    if (!identity || ageGateStatus !== 'verified') return
    markAdultEntered(identity.did)
  }, [identity, ageGateStatus])

  const exit = useCallback(() => {
    clearAdultEntered()
    // Remove transient adult state from the interface; nothing +18 lingers.
    clearAdultActionHistory()
  }, [])

  return {
    identity,
    ageGateStatus,
    adultAccessEnabled,
    canEnter,
    creatorStatus: 'viewer',
    enteredAt: entered ? (entry?.at ?? null) : null,
    enter,
    exit,
  }
}
