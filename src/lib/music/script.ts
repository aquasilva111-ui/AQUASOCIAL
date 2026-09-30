const loaded = new Map<string, Promise<void>>()

/** Loads a third-party SDK script once. */
export function loadScript(src: string): Promise<void> {
  const hit = loaded.get(src)
  if (hit) return hit
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      loaded.delete(src)
      reject(new Error(`Failed to load ${src}`))
    }
    document.head.appendChild(el)
  })
  loaded.set(src, p)
  return p
}
