import {
  AgeAssuranceAccess,
  type AgeAssuranceState,
  AgeAssuranceStatus,
} from '#/ageAssurance/types'

/**
 * Explicit age-gate states for the AQUA +18 environment.
 *
 * Fail-closed contract: only `verified` may ever grant access. Any absence
 * of information (`unknown`, `required`, `pending`) denies entry — being
 * logged in is never treated as proof of adulthood.
 */
export type AdultAgeGateStatus =
  | 'unknown'
  | 'required'
  | 'pending'
  | 'verified'
  | 'denied'
  | 'restricted'

/**
 * Maps the platform age-assurance state onto the +18 gate.
 * Pure function — keep it free of React so it stays unit-testable.
 */
export function resolveAdultAgeGate(
  hasSession: boolean,
  state: AgeAssuranceState | undefined,
): AdultAgeGateStatus {
  if (!hasSession || !state) return 'unknown'
  if (state.access === AgeAssuranceAccess.Full) return 'verified'
  if (state.status === AgeAssuranceStatus.Pending) return 'pending'
  if (
    state.status === AgeAssuranceStatus.Blocked ||
    state.access === AgeAssuranceAccess.None
  )
    return 'denied'
  if (state.access === AgeAssuranceAccess.Safe) return 'restricted'
  return 'required'
}

/**
 * The only path that opens the +18 environment: a verified age gate AND a
 * deliberate, in-session entry action. Everything else is closed.
 */
export function isAdultAccessGranted(
  ageGateStatus: AdultAgeGateStatus,
  entered: boolean,
): boolean {
  return ageGateStatus === 'verified' && entered
}
