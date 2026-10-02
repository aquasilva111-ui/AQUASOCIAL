import {useSyncExternalStore} from 'react'
import {MMKV} from '@bsky.app/react-native-mmkv'

import {pruneSeen} from '#/lib/stories/player'

/**
 * "Seen" tracking for story rings (dims a ring once viewed), persisted on
 * every platform (MMKV; localStorage-backed on web). Entries are
 * timestamps and are pruned once older than a story can live.
 */
const KEY = 'seen'
const store = new MMKV({id: 'aqua-stories'})
const listeners = new Set<() => void>()
let cache: Record<string, number> | undefined

function read(): Record<string, number> {
  if (cache) return cache
  try {
    const raw = JSON.parse(store.getString(KEY) ?? '{}')
    cache = raw && typeof raw === 'object' ? pruneSeen(raw, Date.now()) : {}
  } catch {
    cache = {}
  }
  return cache
}

function write(next: Record<string, number>) {
  cache = next
  try {
    store.set(KEY, JSON.stringify(next))
  } catch {}
  listeners.forEach(l => l())
}

export function isStorySeen(uri: string): boolean {
  return !!read()[uri]
}

export function markStorySeen(uri: string) {
  const seen = read()
  if (seen[uri]) return
  write(pruneSeen({...seen, [uri]: Date.now()}, Date.now()))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Snapshot is the (immutable) map itself so React re-renders only on change.
const snapshot = () => read()

export function useIsStorySeen(uri: string): boolean {
  const seen = useSyncExternalStore(subscribe, snapshot, snapshot)
  return !!seen[uri]
}

/** Re-renders on any change and returns a stable predicate. */
export function useStorySeenPredicate(): (uri: string) => boolean {
  const seen = useSyncExternalStore(subscribe, snapshot, snapshot)
  return (uri: string) => !!seen[uri]
}
