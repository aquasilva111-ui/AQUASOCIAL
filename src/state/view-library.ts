import {useCallback, useSyncExternalStore} from 'react'

import {
  addWatchLater,
  type HistoryEntry,
  moveItem,
  normalizeHistory,
  normalizeRefs,
  recordHistory,
  removeHistory,
  removeWatchLater,
} from '#/lib/view-library/model'
import {useSession} from '#/state/session'
import {type ViewVideoRef} from '#/state/view-playback'

/**
 * Watch history and "watch later", kept on this device per signed-in
 * account (localStorage). Nothing is written to the account or the social
 * graph: pausing history or clearing it is purely local.
 */

type Library = {
  history: HistoryEntry[]
  watchLater: ViewVideoRef[]
  historyPaused: boolean
}

const EMPTY: Library = {history: [], watchLater: [], historyPaused: false}
const key = (did: string) => `aqua.view.library.${did}`

const cache = new Map<string, Library>()
const listeners = new Set<() => void>()

function load(did: string): Library {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(key(did)) ?? 'null')
    return {
      history: normalizeHistory(raw?.history),
      watchLater: normalizeRefs(raw?.watchLater),
      historyPaused: raw?.historyPaused === true,
    }
  } catch {
    return EMPTY
  }
}

function get(did: string | undefined): Library {
  if (!did) return EMPTY
  let lib = cache.get(did)
  if (!lib) {
    lib = load(did)
    cache.set(did, lib)
  }
  return lib
}

function update(did: string | undefined, fn: (lib: Library) => Library) {
  if (!did) return
  const next = fn(get(did))
  cache.set(did, next)
  try {
    globalThis.localStorage?.setItem(key(did), JSON.stringify(next))
  } catch {}
  listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useViewLibrary() {
  const {currentAccount} = useSession()
  const did = currentAccount?.did
  const lib = useSyncExternalStore(
    subscribe,
    () => get(did),
    () => EMPTY,
  )
  return {
    ...lib,
    signedIn: !!did,
    removeFromHistory: useCallback(
      (uri: string) =>
        update(did, l => ({...l, history: removeHistory(l.history, uri)})),
      [did],
    ),
    clearHistory: useCallback(
      () => update(did, l => ({...l, history: []})),
      [did],
    ),
    setHistoryPaused: useCallback(
      (historyPaused: boolean) => update(did, l => ({...l, historyPaused})),
      [did],
    ),
    addWatchLater: useCallback(
      (ref: ViewVideoRef) =>
        update(did, l => ({
          ...l,
          watchLater: addWatchLater(l.watchLater, ref),
        })),
      [did],
    ),
    removeWatchLater: useCallback(
      (uri: string) =>
        update(did, l => ({
          ...l,
          watchLater: removeWatchLater(l.watchLater, uri),
        })),
      [did],
    ),
    moveWatchLater: useCallback(
      (from: number, to: number) =>
        update(did, l => ({
          ...l,
          watchLater: moveItem(l.watchLater, from, to),
        })),
      [did],
    ),
    clearWatchLater: useCallback(
      () => update(did, l => ({...l, watchLater: []})),
      [did],
    ),
  }
}

/** Called by the watch page; respects "pause history". */
export function recordWatch(did: string | undefined, ref: ViewVideoRef) {
  update(did, l =>
    l.historyPaused
      ? l
      : {...l, history: recordHistory(l.history, ref, Date.now())},
  )
}

/** Test helper. */
export function resetViewLibrary() {
  cache.clear()
  listeners.forEach(l => l())
}
