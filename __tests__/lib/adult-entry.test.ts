import {
  clearAdultEntered,
  getAdultEntry,
  markAdultEntered,
  subscribeAdultEntry,
} from '#/state/adult/entered'
import {
  ADULT_SELF_DECLARATION_POLICY_VERSION,
  isAdultAccessGranted,
  resolveAdultEntryMethod,
} from '#/state/adult/gate'

afterEach(() => clearAdultEntered())

describe('+18 entry record', () => {
  it('starts outside +18 (a refresh never restores an entry)', () => {
    jest.isolateModules(() => {
      const fresh = require('#/state/adult/entered')
      expect(fresh.getAdultEntry()).toBe(null)
    })
  })

  it('records a self-declared entry for one account only', () => {
    markAdultEntered('did:plc:alice', 'self_declared')
    const entry = getAdultEntry()
    expect(entry).toMatchObject({did: 'did:plc:alice', method: 'self_declared'})
    // Callers compare the DID: another account is not "entered".
    expect(entry?.did === 'did:plc:bob').toBe(false)
  })

  it('clearing (exit, logout, account switch) closes the gate and notifies', () => {
    const listener = jest.fn()
    const unsubscribe = subscribeAdultEntry(listener)
    markAdultEntered('did:plc:alice', 'self_declared')
    clearAdultEntered()
    expect(getAdultEntry()).toBe(null)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    expect(isAdultAccessGranted('required', false, false)).toBe(false)
  })
})

describe('self-declaration is never verification', () => {
  it('the declaration resolves to self_declared, not verified', () => {
    expect(resolveAdultEntryMethod('required', false)).toBe('self_declared')
    expect(resolveAdultEntryMethod('unknown', false)).not.toBe('verified')
  })

  it('with the verification flag on, the declaration opens nothing', () => {
    expect(resolveAdultEntryMethod('required', true)).toBe(null)
    expect(isAdultAccessGranted('required', true, true)).toBe(false)
  })

  it('has a policy version to tie declarations to the text accepted', () => {
    expect(ADULT_SELF_DECLARATION_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
