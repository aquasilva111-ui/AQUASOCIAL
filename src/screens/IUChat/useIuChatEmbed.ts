import {useCallback, useEffect, useRef, useState} from 'react'

import {
  decideIuChatView,
  isSameSite,
  IU_CHAT_PROBE_PATH,
  iuChatUpstream,
  type IuChatView,
} from '#/lib/iu-chat'
import {isWeb} from '#/platform/detection'

const RETRY_MS = 5000
const TIMEOUT_MS = 4000

export type IuChatAvailability = {
  status: IuChatView | 'loading'
  url: string
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function loadAvailability(url: string): Promise<IuChatAvailability> {
  if (!isWeb || typeof window === 'undefined') {
    // The WebView is the top-level document. A preflight fetch is a poor
    // signal (cleartext and CORS differ), so the screen reports load errors.
    return {url, status: 'embed'}
  }

  const aquaOrigin = window.location.origin
  const sameSite = isSameSite(aquaOrigin, url)
  try {
    const response = await withTimeout(
      fetch(IU_CHAT_PROBE_PATH, {cache: 'no-store'}),
      TIMEOUT_MS,
    )
    if (response.ok) {
      const body = (await response.json()) as {
        reachable?: boolean
        frameable?: boolean
        url?: string
      }
      if (typeof body.reachable === 'boolean') {
        return {
          url: body.url || url,
          status: decideIuChatView({
            reachable: body.reachable,
            frameable: !!body.frameable,
            sameSite,
            framingKnown: true,
            native: false,
          }),
        }
      }
    }
  } catch {
    // The static host has no probe. Fall through to a direct check.
  }

  let reachable = false
  try {
    await withTimeout(
      fetch(url, {mode: 'no-cors', cache: 'no-store'}),
      TIMEOUT_MS,
    )
    reachable = true
  } catch {
    reachable = false
  }
  return {
    url,
    status: decideIuChatView({
      reachable,
      frameable: false,
      sameSite,
      framingKnown: false,
      native: false,
    }),
  }
}

export function useIuChatEmbed() {
  const [view, setView] = useState<IuChatAvailability>({
    status: 'loading',
    url: iuChatUpstream(),
  })
  const statusRef = useRef(view.status)
  const generation = useRef(0)

  useEffect(() => {
    statusRef.current = view.status
  }, [view.status])

  const refresh = useCallback(async () => {
    const ticket = ++generation.current
    const next = await loadAvailability(iuChatUpstream())
    if (ticket === generation.current) setView(next)
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(() => {
      if (statusRef.current === 'embed') return
      refresh()
    }, RETRY_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return {view, retry: refresh}
}
