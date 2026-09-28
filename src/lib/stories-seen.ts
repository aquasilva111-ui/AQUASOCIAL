import {useEffect, useState} from 'react'

import {isWeb} from '#/platform/detection'

/** Per-browser "seen" tracking for story rings (dims a ring once viewed). */
const STORAGE_KEY = 'aqua-stories-seen'
const listeners = new Set<() => void>()

function readAll(): Record<string, true> {
  if (!isWeb) return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAll(seen: Record<string, true>) {
  if (!isWeb) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen))
  } catch {}
  listeners.forEach(listener => listener())
}

export function isStorySeen(uri: string): boolean {
  return !!readAll()[uri]
}

export function markStorySeen(uri: string) {
  const seen = readAll()
  if (seen[uri]) return
  seen[uri] = true
  writeAll(seen)
}

export function useIsStorySeen(uri: string): boolean {
  const [seen, setSeen] = useState(() => isStorySeen(uri))
  useEffect(() => {
    setSeen(isStorySeen(uri))
    const unsubscribe = () => setSeen(isStorySeen(uri))
    listeners.add(unsubscribe)
    return () => {
      listeners.delete(unsubscribe)
    }
  }, [uri])
  return seen
}
