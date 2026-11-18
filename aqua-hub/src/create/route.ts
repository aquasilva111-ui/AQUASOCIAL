export const TOOL_IDS = ['design', 'write', 'slides', 'sheet', 'music', 'mix', 'audio', 'video', 'chart', 'cube'] as const

export type ToolId = (typeof TOOL_IDS)[number]

export type Route = { name: 'launcher' } | { name: 'workspace'; tool: ToolId; itemId?: string }

const TOOL_SET = new Set<string>(TOOL_IDS)

export function isToolId(value: string): value is ToolId {
  return TOOL_SET.has(value)
}

/** `/create`, `/create/:tool`, `/create/:tool/:itemId`. Anything else is null. */
export function parseCreatePath(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  if (parts[0] !== 'create') return null
  if (parts.length === 1) return { name: 'launcher' }
  if (parts.length > 3 || !isToolId(parts[1])) return { name: 'launcher' }
  const itemId = parts[2] ? decodeURIComponent(parts[2]) : undefined
  return { name: 'workspace', tool: parts[1], itemId }
}

export function hrefFor(route: Route, search = ''): string {
  const q = search ? (search.startsWith('?') ? search : `?${search}`) : ''
  if (route.name === 'launcher') return `/create${q}`
  const id = route.itemId ? `/${encodeURIComponent(route.itemId)}` : ''
  return `/create/${route.tool}${id}${q}`
}

/** Bare `/` and a bad `/create/...` land on the launcher. Other paths are left alone. */
export function ensureCreateEntry() {
  const route = parseCreatePath(location.pathname)
  const path = location.pathname.replace(/\/+$/, '') || '/'
  const tail = location.search + location.hash
  if (route === null) {
    if (path === '/') history.replaceState(null, '', `/create${tail}`)
    return
  }
  const parts = path.split('/').filter(Boolean)
  if (route.name === 'launcher' && parts.length > 1) {
    history.replaceState(null, '', `/create${tail}`)
  }
}

export function sameRoute(a: Route, b: Route) {
  if (a.name !== b.name) return false
  if (a.name === 'launcher' || b.name === 'launcher') return a.name === b.name
  return a.tool === b.tool && a.itemId === b.itemId
}
