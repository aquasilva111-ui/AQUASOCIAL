/** The shell asks an editor to open its existing AI surface. No network. */

let pending: string | null = null

export function askAi(tool: string) {
  pending = tool
  window.dispatchEvent(new CustomEvent('aqua-hub:ai', { detail: { tool } }))
}

/** True once, if the shell asked for this tool before the editor was listening. */
export function takeAi(tool: string) {
  if (pending !== tool) return false
  pending = null
  return true
}

export function clearAi(tool: string) {
  if (pending === tool) pending = null
}
