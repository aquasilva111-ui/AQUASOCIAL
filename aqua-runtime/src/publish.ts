/**
 * Shared publish helper for Hub tools.
 * Sends a message to the parent app (same pattern as aqua-docs).
 */

export type PublishPayload = {
  type: 'aqua-hub:publish'
  title: string
  preview: string
  source: 'music' | 'video' | 'design' | 'docs' | 'sheets' | string
  media?: { url: string; mime: string }
  markdown?: string
}

export function publishToAqua(payload: PublishPayload) {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  const host = params.get('host')

  if (host && window.parent && window.parent !== window) {
    window.parent.postMessage(payload, host)
  } else {
    // Standalone fallback — you can replace this with a download or local save
    console.log('[aqua-hub] publish (no host):', payload)
    // Optional: trigger download of a simple text file
    const blob = new Blob([payload.preview], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${payload.title || 'aqua-export'}.txt`
    a.click()
  }
}
