/**
 * Adult creator relationships: AdultFollow, CreatorBlock, CreatorMute.
 *
 * These live ONLY inside the adult context — in memory, bound to the
 * account DID, cleared on exit/switch/logout. They are never written to the
 * public AT repo (a public app.bsky.graph.follow would expose exactly the
 * information this environment exists to keep private). Durable private
 * storage arrives with the +18 backend (FASE 8+).
 */

type RelationshipState = {
  did: string
  follows: Set<string>
  blocks: Set<string>
  mutes: Set<string>
}

let state: RelationshipState | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function forAccount(did: string): RelationshipState {
  if (!state || state.did !== did) {
    state = {did, follows: new Set(), blocks: new Set(), mutes: new Set()}
  }
  return state
}

let snapshotVersion = 0
function snapshot() {
  return {state, version: snapshotVersion}
}

export function subscribeAdultRelationships(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getAdultRelationshipsSnapshot() {
  return snapshot()
}

export function isAdultFollowing(did: string, creatorDid: string): boolean {
  return !!state && state.did === did && state.follows.has(creatorDid)
}

export function isCreatorBlocked(did: string, creatorDid: string): boolean {
  return !!state && state.did === did && state.blocks.has(creatorDid)
}

export function isCreatorMuted(did: string, creatorDid: string): boolean {
  return !!state && state.did === did && state.mutes.has(creatorDid)
}

export function followAdultCreator(did: string, creatorDid: string): void {
  if (isCreatorBlocked(did, creatorDid)) return
  forAccount(did).follows.add(creatorDid)
  snapshotVersion++
  emit()
}

export function unfollowAdultCreator(did: string, creatorDid: string): void {
  forAccount(did).follows.delete(creatorDid)
  snapshotVersion++
  emit()
}

export function blockAdultCreator(did: string, creatorDid: string): void {
  const s = forAccount(did)
  s.blocks.add(creatorDid)
  // Blocking severs the adult follow relationship, never financial records.
  s.follows.delete(creatorDid)
  snapshotVersion++
  emit()
}

export function unblockAdultCreator(did: string, creatorDid: string): void {
  forAccount(did).blocks.delete(creatorDid)
  snapshotVersion++
  emit()
}

export function muteAdultCreator(did: string, creatorDid: string): void {
  forAccount(did).mutes.add(creatorDid)
  snapshotVersion++
  emit()
}

export function unmuteAdultCreator(did: string, creatorDid: string): void {
  forAccount(did).mutes.delete(creatorDid)
  snapshotVersion++
  emit()
}

export function clearAdultRelationships(): void {
  state = null
  snapshotVersion++
  emit()
}
