import {useEffect, useState} from 'react'

import {recordViewEvent} from '#/lib/views/events'
import {isWeb} from '#/platform/detection'

/**
 * Per-browser video view counter. There's no server-side view metric on
 * posts yet, so this counts views locally (per device) as a placeholder —
 * it does not reflect a global, cross-viewer count.
 */
const STORAGE_KEY = 'aqua-video-views'
const listeners = new Set<() => void>()
const recordedThisSession = new Set<string>()

function readAll(): Record<string, number> {
  if (!isWeb) return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAll(views: Record<string, number>) {
  if (!isWeb) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
  } catch {}
  listeners.forEach(listener => listener())
}

export function getViewCount(uri: string): number {
  return readAll()[uri] ?? 0
}

export function recordView(uri: string) {
  if (!isWeb || recordedThisSession.has(uri)) return
  recordedThisSession.add(uri)
  const views = readAll()
  views[uri] = (views[uri] ?? 0) + 1
  writeAll(views)
  recordViewEvent({
    contentUri: uri,
    contentType: 'video',
    eventType: 'view',
    surface: 'view',
    source: 'local-placeholder',
  })
}

export function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mi`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} mil`
  return `${n}`
}

export function useViewCount(uri: string): number {
  const [count, setCount] = useState(() => getViewCount(uri))
  useEffect(() => {
    setCount(getViewCount(uri))
    const unsubscribe = () => setCount(getViewCount(uri))
    listeners.add(unsubscribe)
    return () => {
      listeners.delete(unsubscribe)
    }
  }, [uri])
  return count
}
