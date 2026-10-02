/** Tools of the Creative Hub; each item of a project belongs to one. */
export type ItemKind = 'doc' | 'design' | 'presentation' | 'sheet' | 'video' | 'audio' | 'music' | 'chart'

export interface AssetRef {
  /** sha-256 of the bytes, hex. Same bytes, same asset. */
  hash: string
  mime: string
  size: number
}

export interface ProjectItem {
  id: string
  kind: ItemKind
  name: string
  /** Hash of the current version's content. */
  head: string | null
  createdAt: string
  updatedAt: string
  /** Other items or assets this item embeds (an image in a doc, a sheet in a deck...). */
  links: ItemLink[]
}

export type ItemLink = { type: 'item'; id: string } | { type: 'asset'; hash: string }

export interface Version {
  id: string
  itemId: string
  hash: string
  at: string
  message: string
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  items: ProjectItem[]
  versions: Version[]
}
