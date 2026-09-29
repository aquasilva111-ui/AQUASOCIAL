import {useCallback, useMemo} from 'react'
import {useSyncExternalStore} from 'react'
import {useQueryClient} from '@tanstack/react-query'

import {clearAdultApiToken, recordAdultSelfDeclaration} from '#/lib/adult/api'
import {ADULT_QUERY_NAMESPACE} from '#/lib/adult/isolation'
import {useGate} from '#/lib/statsig/statsig'
import {clearAdultActionHistory} from '#/state/adult/actionHistory'
import {
  clearAdultEntered,
  getAdultEntry,
  markAdultEntered,
  subscribeAdultEntry,
} from '#/state/adult/entered'
import {
  ADULT_SELF_DECLARATION_POLICY_VERSION,
  type AdultAgeGateStatus,
  type AdultEntryMethod,
  isAdultAccessGranted,
  resolveAdultAgeGate,
  resolveAdultEntryMethod,
} from '#/state/adult/gate'
import {clearAdultRelationships} from '#/state/adult/relationships'
import {useAgent, useSession} from '#/state/session'
import {useAgeAssurance} from '#/ageAssurance'
import {account} from '#/storage'

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
  /**
   * True only when the gate allows an entry method AND the user deliberately
   * entered.
   */
  adultAccessEnabled: boolean
  /** Whether the gate alone would allow entry (pre-confirmation). */
  canEnter: boolean
  /**
   * How the current entry was established. `self_declared` is NOT an age
   * verification — surfaces must not treat it as AGE_VERIFIED.
   */
  entryMethod: AdultEntryMethod | null
  /** Whether the real age-verification pipeline is the active gate. */
  ageVerificationEnabled: boolean
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
  const queryClient = useQueryClient()
  const agent = useAgent()
  const entry = useSyncExternalStore(subscribeAdultEntry, getAdultEntry)
  const gate = useGate()
  // ADULT_AGE_VERIFICATION flag (Statsig gate, default off): when off, the
  // temporary self-declaration gate applies. When on, only the real
  // age-assurance pipeline opens +18. Reserved for the future Age
  // Assurance / Age Verification integration.
  const ageVerificationEnabled = gate('adult_age_verification')

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
  const allowedMethod = resolveAdultEntryMethod(
    ageGateStatus,
    ageVerificationEnabled,
  )
  const entered = identity !== null && entry?.did === identity.did
  const canEnter = identity !== null && allowedMethod !== null
  const adultAccessEnabled =
    identity !== null &&
    isAdultAccessGranted(ageGateStatus, entered, ageVerificationEnabled)

  const enter = useCallback(() => {
    // Fail closed: refuse to mark entry unless the gate allows a method now.
    if (!identity) return
    const method = resolveAdultEntryMethod(
      ageGateStatus,
      ageVerificationEnabled,
    )
    if (!method) return
    markAdultEntered(identity.did, method)
    if (method === 'self_declared') {
      // Minimal audit record of the declaration only — never an
      // AGE_VERIFIED marker.
      account.set([identity.did, 'adultAgeDeclaration'], {
        status: 'self_declared',
        at: new Date().toISOString(),
        policyVersion: ADULT_SELF_DECLARATION_POLICY_VERSION,
      })
      // Server-side record so aqua-adult-api can tell `self_declared` from
      // `verified`. Best effort: the in-session entry stands even while the
      // +18 API is unreachable; its routes then answer
      // `adult_declaration_required` and AdultApiNotice offers a retry.
      recordAdultSelfDeclaration(agent).catch(() => {})
    }
  }, [identity, ageGateStatus, ageVerificationEnabled, agent])

  const exit = useCallback(() => {
    clearAdultEntered()
    // Remove transient adult state from the interface; nothing +18 lingers.
    clearAdultActionHistory()
    clearAdultRelationships()
    // Library, purchases, history: drop every cached +18 response and token.
    clearAdultApiToken()
    queryClient.removeQueries({queryKey: [ADULT_QUERY_NAMESPACE]})
  }, [queryClient])

  return {
    identity,
    ageGateStatus,
    adultAccessEnabled,
    canEnter,
    entryMethod: entered ? (entry?.method ?? null) : null,
    ageVerificationEnabled,
    creatorStatus: 'viewer',
    enteredAt: entered ? (entry?.at ?? null) : null,
    enter,
    exit,
  }
}
