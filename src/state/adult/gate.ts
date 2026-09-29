import {
  AgeAssuranceAccess,
  type AgeAssuranceState,
  AgeAssuranceStatus,
} from '#/ageAssurance/types'

/**
 * Explicit age-gate states for the AQUA +18 environment.
 *
 * Fail-closed contract for VERIFIED access: only `verified` may ever grant
 * access through the age-assurance pipeline. Any absence of information
 * (`unknown`, `required`, `pending`) denies entry — being logged in is never
 * treated as proof of adulthood.
 */
export type AdultAgeGateStatus =
  | 'unknown'
  | 'required'
  | 'pending'
  | 'verified'
  | 'denied'
  | 'restricted'

/**
 * How the current adult entry was established.
 *
 * `verified` — the age-assurance pipeline completed (AGE_VERIFIED).
 * `self_declared` — the user only declared majority at the entry gate
 * (SELF_DECLARED_ADULT). This is a TEMPORARY product gate and must never be
 * treated as, or persisted as, an age verification.
 */
export type AdultEntryMethod = 'verified' | 'self_declared'

/**
 * Version of the +18 entry policy text the user agreed to when
 * self-declaring. Bump when the gate copy changes materially so stored
 * declarations can be invalidated later if needed.
 */
export const ADULT_SELF_DECLARATION_POLICY_VERSION = '2026-09-29'

/**
 * Maps the platform age-assurance state onto the +18 gate.
 * Pure function — keep it free of React so it stays unit-testable.
 */
export function resolveAdultAgeGate(
  hasSession: boolean,
  state: AgeAssuranceState | undefined,
): AdultAgeGateStatus {
  if (!hasSession || !state) return 'unknown'
  if (
    state.status === AgeAssuranceStatus.Blocked ||
    state.access === AgeAssuranceAccess.None
  )
    return 'denied'
  if (state.status === AgeAssuranceStatus.Pending) return 'pending'
  // `Full` alone is NOT proof of adulthood: outside regions with age laws
  // the platform grants it from a self-declared birthdate (min age 13), and
  // it is also the fallback when no data exists. +18 needs a completed
  // verification (`Assured`).
  if (
    state.status === AgeAssuranceStatus.Assured &&
    state.access === AgeAssuranceAccess.Full
  )
    return 'verified'
  if (state.access === AgeAssuranceAccess.Safe) return 'restricted'
  return 'required'
}

/**
 * Which entry method (if any) the gate currently allows.
 *
 * With the age-verification pipeline enabled (`adult_age_verification`
 * gate), only `verified` opens the +18 environment — the original
 * fail-closed contract. While it is disabled (default), the temporary
 * self-declaration gate applies: every non-blocked state may enter by
 * declaring majority. Hard blocks (`denied`, `restricted`) always fail
 * closed regardless of the flag.
 */
export function resolveAdultEntryMethod(
  ageGateStatus: AdultAgeGateStatus,
  ageVerificationEnabled: boolean,
): AdultEntryMethod | null {
  if (ageGateStatus === 'verified') return 'verified'
  if (ageVerificationEnabled) return null
  if (ageGateStatus === 'denied' || ageGateStatus === 'restricted') return null
  return 'self_declared'
}

/**
 * The only paths that open the +18 environment: an allowed entry method AND
 * a deliberate, in-session entry action. Everything else is closed.
 */
export function isAdultAccessGranted(
  ageGateStatus: AdultAgeGateStatus,
  entered: boolean,
  ageVerificationEnabled: boolean,
): boolean {
  return (
    entered &&
    resolveAdultEntryMethod(ageGateStatus, ageVerificationEnabled) !== null
  )
}
