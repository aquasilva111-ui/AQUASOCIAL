/**
 * In-memory record of the deliberate entry into the +18 environment.
 *
 * Intentionally NOT persisted: every fresh app start begins outside the +18
 * context, and the record is bound to the account DID so switching accounts
 * or logging out can never leave an orphaned adult session behind.
 */
type EnteredRecord = {
  did: string
  at: string
}

let current: EnteredRecord | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function getAdultEntry(): EnteredRecord | null {
  return current
}

export function markAdultEntered(did: string) {
  current = {did, at: new Date().toISOString()}
  emit()
}

export function clearAdultEntered() {
  if (current === null) return
  current = null
  emit()
}

export function subscribeAdultEntry(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
