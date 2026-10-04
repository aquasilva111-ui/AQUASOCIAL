import type { AssetStore } from './store'
import type { AssetRef, ItemKind, ItemLink, Project, ProjectItem, Version } from './types'

let counter = 0
const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export function createProject(name: string, now = new Date().toISOString()): Project {
  return { id: newId('prj'), name: name.trim() || 'Projeto sem título', createdAt: now, updatedAt: now, items: [], versions: [] }
}

/** Project operations are pure: they return a new Project and never mutate the input. */
export function addItem(project: Project, kind: ItemKind, name: string, now = new Date().toISOString()): { project: Project; item: ProjectItem } {
  const item: ProjectItem = { id: newId('itm'), kind, name: name.trim() || 'Sem título', head: null, createdAt: now, updatedAt: now, links: [] }
  return { project: { ...project, updatedAt: now, items: [...project.items, item] }, item }
}

export function renameItem(project: Project, itemId: string, name: string, now = new Date().toISOString()): Project {
  return mapItem(project, itemId, (i) => ({ ...i, name: name.trim() || i.name, updatedAt: now }), now)
}

/** Puts an item at `toIndex` in the list (clamped); the order is how the project lists its items. */
export function moveItem(project: Project, itemId: string, toIndex: number, now = new Date().toISOString()): Project {
  const from = project.items.findIndex((i) => i.id === itemId)
  if (from < 0) throw new Error(`Item not found: ${itemId}`)
  const items = [...project.items]
  const [it] = items.splice(from, 1)
  items.splice(Math.max(0, Math.min(toIndex, items.length)), 0, it)
  return { ...project, updatedAt: now, items }
}

export function removeItem(project: Project, itemId: string, now = new Date().toISOString()): Project {
  return {
    ...project,
    updatedAt: now,
    items: project.items
      .filter((i) => i.id !== itemId)
      .map((i) => ({ ...i, links: i.links.filter((l) => !(l.type === 'item' && l.id === itemId)) })),
    versions: project.versions.filter((v) => v.itemId !== itemId)
  }
}

/** Stores the bytes and records a version. Saving identical content again is a no-op. */
export async function saveItem(
  project: Project,
  store: AssetStore,
  itemId: string,
  bytes: Uint8Array,
  mime: string,
  message = '',
  now = new Date().toISOString()
): Promise<{ project: Project; ref: AssetRef; version: Version | null }> {
  const item = project.items.find((i) => i.id === itemId)
  if (!item) throw new Error(`Item not found: ${itemId}`)
  const ref = await store.put(bytes, mime)
  if (item.head === ref.hash) return { project, ref, version: null }
  const version: Version = { id: newId('ver'), itemId, hash: ref.hash, at: now, message }
  const next = mapItem(project, itemId, (i) => ({ ...i, head: ref.hash, updatedAt: now }), now)
  return { project: { ...next, versions: [...next.versions, version] }, ref, version }
}

export function listVersions(project: Project, itemId: string): Version[] {
  return project.versions.filter((v) => v.itemId === itemId).sort((a, b) => b.at.localeCompare(a.at))
}

/** Restoring points head at an older version and records that as a new version (history is kept). */
export function restoreVersion(project: Project, versionId: string, now = new Date().toISOString()): Project {
  const v = project.versions.find((x) => x.id === versionId)
  if (!v) throw new Error(`Version not found: ${versionId}`)
  const next = mapItem(project, v.itemId, (i) => ({ ...i, head: v.hash, updatedAt: now }), now)
  const restored: Version = { id: newId('ver'), itemId: v.itemId, hash: v.hash, at: now, message: `Restaurado de ${v.at}` }
  return { ...next, versions: [...next.versions, restored] }
}

export function linkItem(project: Project, itemId: string, link: ItemLink): Project {
  if (link.type === 'item' && link.id === itemId) return project
  return mapItem(project, itemId, (i) => {
    const has = i.links.some((l) => JSON.stringify(l) === JSON.stringify(link))
    return has ? i : { ...i, links: [...i.links, link] }
  })
}

/** Items that embed the given item or asset, so deleting or replacing it can warn first. */
export function usedBy(project: Project, target: ItemLink): ProjectItem[] {
  return project.items.filter((i) => i.links.some((l) => l.type === target.type && (l.type === 'item' ? l.id === (target as { id: string }).id : l.hash === (target as { hash: string }).hash)))
}

/** Asset hashes still referenced by a version or link; the rest can be garbage-collected. */
export function liveHashes(project: Project): Set<string> {
  const out = new Set<string>()
  for (const v of project.versions) out.add(v.hash)
  for (const i of project.items) for (const l of i.links) if (l.type === 'asset') out.add(l.hash)
  return out
}

function mapItem(project: Project, itemId: string, fn: (i: ProjectItem) => ProjectItem, now?: string): Project {
  if (!project.items.some((i) => i.id === itemId)) throw new Error(`Item not found: ${itemId}`)
  return { ...project, updatedAt: now ?? project.updatedAt, items: project.items.map((i) => (i.id === itemId ? fn(i) : i)) }
}
