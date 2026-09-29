import {isAdultAccessGranted, resolveAdultAgeGate} from '#/state/adult/gate'
import {
  AgeAssuranceAccess,
  type AgeAssuranceState,
  AgeAssuranceStatus,
} from '#/ageAssurance/types'

function aa(
  status: AgeAssuranceStatus,
  access: AgeAssuranceAccess,
): AgeAssuranceState {
  return {status, access}
}

describe('resolveAdultAgeGate', () => {
  it('is unknown without a session, even with full access state', () => {
    expect(
      resolveAdultAgeGate(
        false,
        aa(AgeAssuranceStatus.Assured, AgeAssuranceAccess.Full),
      ),
    ).toBe('unknown')
  })

  it('is unknown without age assurance state', () => {
    expect(resolveAdultAgeGate(true, undefined)).toBe('unknown')
  })

  it('is verified only with full access', () => {
    expect(
      resolveAdultAgeGate(
        true,
        aa(AgeAssuranceStatus.Assured, AgeAssuranceAccess.Full),
      ),
    ).toBe('verified')
  })

  it('is NOT verified by full access from a declared age alone', () => {
    // Default-region rule: declared age >= 13 yields Full without assurance.
    expect(
      resolveAdultAgeGate(
        true,
        aa(AgeAssuranceStatus.Unknown, AgeAssuranceAccess.Full),
      ),
    ).toBe('required')
    expect(
      isAdultAccessGranted(
        resolveAdultAgeGate(
          true,
          aa(AgeAssuranceStatus.Unknown, AgeAssuranceAccess.Full),
        ),
        true,
      ),
    ).toBe(false)
  })

  it('is pending while verification is in progress', () => {
    expect(
      resolveAdultAgeGate(
        true,
        aa(AgeAssuranceStatus.Pending, AgeAssuranceAccess.Safe),
      ),
    ).toBe('pending')
  })

  it('is denied when blocked or access is none', () => {
    expect(
      resolveAdultAgeGate(
        true,
        aa(AgeAssuranceStatus.Blocked, AgeAssuranceAccess.None),
      ),
    ).toBe('denied')
    expect(
      resolveAdultAgeGate(
        true,
        aa(AgeAssuranceStatus.Unknown, AgeAssuranceAccess.None),
      ),
    ).toBe('denied')
  })

  it('is restricted in safe mode', () => {
    expect(
      resolveAdultAgeGate(
        true,
        aa(AgeAssuranceStatus.Unknown, AgeAssuranceAccess.Safe),
      ),
    ).toBe('restricted')
  })

  it('requires verification when access is simply unknown', () => {
    expect(
      resolveAdultAgeGate(
        true,
        aa(AgeAssuranceStatus.Unknown, AgeAssuranceAccess.Unknown),
      ),
    ).toBe('required')
  })
})

describe('isAdultAccessGranted (fail closed)', () => {
  it('grants only verified + deliberate entry', () => {
    expect(isAdultAccessGranted('verified', true)).toBe(true)
  })

  it('never grants without deliberate entry', () => {
    expect(isAdultAccessGranted('verified', false)).toBe(false)
  })

  it.each(['unknown', 'required', 'pending', 'denied', 'restricted'] as const)(
    'never grants in the %s state, even after entry',
    status => {
      expect(isAdultAccessGranted(status, true)).toBe(false)
    },
  )
})
