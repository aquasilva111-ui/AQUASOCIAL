/**
 * Adult creator relationships: AdultFollow, CreatorBlock, CreatorMute.
 *
 * These live ONLY inside the adult context — in memory, bound to the
 * account DID, cleared on exit/switch/logout. They are never written to the
 * public AT repo (a public app.bsky.graph.follow would expose exactly the
 * information this environment exists to keep private). The durable copy
 * lives on aqua-adult-api (follows, mutes, blocks) and is hydrated into this
 * in-memory state when the user enters +18.
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
let cachedSnapshot: {
  state: RelationshipState | null
  version: number
} | null = null
/**
 * useSyncExternalStore compares snapshots by identity, so the same object
 * must be returned until something changes. A fresh object per call makes
 * React re-render forever (error #185).
 */
function snapshot() {
  if (
    !cachedSnapshot ||
    cachedSnapshot.state !== state ||
    cachedSnapshot.version !== snapshotVersion
  ) {
    cachedSnapshot = {state, version: snapshotVersion}
  }
  return cachedSnapshot
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

/**
 * Replaces the local relationships with the server copy (on entering +18).
 * Local changes made while offline are kept only until the next hydrate.
 */
export function hydrateAdultRelationships(
  did: string,
  server: {follows: string[]; mutes: string[]; blocks: string[]},
): void {
  const s = forAccount(did)
  s.follows = new Set(server.follows)
  s.mutes = new Set(server.mutes)
  s.blocks = new Set(server.blocks)
  snapshotVersion++
  emit()
}

export function clearAdultRelationships(): void {
  state = null
  snapshotVersion++
  emit()
}
