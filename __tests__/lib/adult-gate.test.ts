import {
  isAdultAccessGranted,
  resolveAdultAgeGate,
  resolveAdultEntryMethod,
} from '#/state/adult/gate'
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

describe('isAdultAccessGranted with age verification enabled (fail closed)', () => {
  it('grants only verified + deliberate entry', () => {
    expect(isAdultAccessGranted('verified', true, true)).toBe(true)
  })

  it('never grants without deliberate entry', () => {
    expect(isAdultAccessGranted('verified', false, true)).toBe(false)
  })

  it.each(['unknown', 'required', 'pending', 'denied', 'restricted'] as const)(
    'never grants in the %s state, even after entry',
    status => {
      expect(isAdultAccessGranted(status, true, true)).toBe(false)
    },
  )
})

describe('resolveAdultEntryMethod', () => {
  it('verified always resolves to the verified method', () => {
    expect(resolveAdultEntryMethod('verified', true)).toBe('verified')
    expect(resolveAdultEntryMethod('verified', false)).toBe('verified')
  })

  it('denied and restricted never resolve, flag on or off', () => {
    for (const status of ['denied', 'restricted'] as const) {
      expect(resolveAdultEntryMethod(status, true)).toBe(null)
      expect(resolveAdultEntryMethod(status, false)).toBe(null)
    }
  })

  it.each(['unknown', 'required', 'pending'] as const)(
    'resolves %s to self_declared only while verification is disabled',
    status => {
      expect(resolveAdultEntryMethod(status, false)).toBe('self_declared')
      expect(resolveAdultEntryMethod(status, true)).toBe(null)
    },
  )
})

describe('isAdultAccessGranted with the temporary self-declaration gate', () => {
  it.each(['unknown', 'required', 'pending'] as const)(
    'grants %s after a deliberate entry',
    status => {
      expect(isAdultAccessGranted(status, true, false)).toBe(true)
    },
  )

  it('still never grants without deliberate entry', () => {
    expect(isAdultAccessGranted('unknown', false, false)).toBe(false)
    expect(isAdultAccessGranted('required', false, false)).toBe(false)
  })

  it.each(['denied', 'restricted'] as const)(
    'still fails closed in the %s state, even after entry',
    status => {
      expect(isAdultAccessGranted(status, true, false)).toBe(false)
    },
  )
})
