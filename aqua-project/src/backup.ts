import { liveHashes } from './repo'
import { sha256Hex, type AssetStore } from './store'
import type { Project } from './types'

const kinds = new Set(['doc', 'design', 'presentation', 'sheet', 'video', 'audio', 'mix', 'music', 'chart'])
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const tags = (value: unknown) => value === undefined || (Array.isArray(value) && value.every(t => typeof t === 'string'))
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

export function parseProject(value: unknown): Project {
  if (!record(value) || !['id', 'name', 'createdAt', 'updatedAt'].every(k => typeof value[k] === 'string') ||
      !tags(value.tags) || (value.category !== undefined && typeof value.category !== 'string') ||
      !Array.isArray(value.items) || !Array.isArray(value.versions)) throw new Error('Projeto inválido.')
  const ids = new Set<string>()
  for (const item of value.items) {
    if (!record(item) || !['id', 'name', 'createdAt', 'updatedAt'].every(k => typeof item[k] === 'string') ||
        !kinds.has(item.kind) || ids.has(item.id) || !tags(item.tags) ||
        (item.category !== undefined && typeof item.category !== 'string') ||
        !(item.head === null || hash(item.head)) || !Array.isArray(item.links) ||
        !item.links.every((link: unknown) => record(link) &&
          ((link.type === 'asset' && hash(link.hash)) || (link.type === 'item' && typeof link.id === 'string')))) {
      throw new Error('Item inválido no backup.')
    }
    ids.add(item.id)
  }
  if (!value.versions.every((v: unknown) => record(v) && ['id', 'itemId', 'at', 'message'].every(k => typeof v[k] === 'string') &&
      ids.has(v.itemId) && hash(v.hash))) throw new Error('Histórico inválido no backup.')
  return value as unknown as Project
}

function referenced(project: Project): Set<string> {
  const hashes = liveHashes(project)
  for (const item of project.items) if (item.head) hashes.add(item.head)
  return hashes
}

const base64 = (bytes: Uint8Array) => {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return btoa(binary)
}

export async function exportProjectBackup(project: Project, store: AssetStore) {
  const assets = []
  for (const key of referenced(project)) {
    const asset = await store.get(key)
    if (!asset) throw new Error('Um arquivo do projeto está indisponível. O backup não foi gerado.')
    assets.push({ hash: key, mime: asset.ref.mime, data: base64(asset.bytes) })
  }
  return { app: 'AQUA Create', version: 2, exportedAt: new Date().toISOString(), project, assets }
}

/** Validate every asset before writing any content or replacing the active project. */
export async function importProjectBackup(value: unknown, store: AssetStore): Promise<Project> {
  const wrapper = record(value) && 'project' in value ? value : null
  if (wrapper && wrapper.version !== 1 && wrapper.version !== 2) throw new Error('Versão de backup não suportada.')
  const project = parseProject(wrapper ? wrapper.project : value)
  const decoded = new Map<string, { bytes: Uint8Array; mime: string }>()
  if (wrapper?.version === 2) {
    if (!Array.isArray(wrapper.assets)) throw new Error('Arquivos ausentes no backup.')
    for (const asset of wrapper.assets) {
      if (!record(asset) || !hash(asset.hash) || typeof asset.mime !== 'string' || typeof asset.data !== 'string' || decoded.has(asset.hash)) {
        throw new Error('Arquivo inválido no backup.')
      }
      const bytes = Uint8Array.from(atob(asset.data), c => c.charCodeAt(0))
      if (await sha256Hex(bytes) !== asset.hash) throw new Error('O backup contém um arquivo corrompido.')
      decoded.set(asset.hash, { bytes, mime: asset.mime })
    }
  }
  for (const key of referenced(project)) {
    if (!decoded.has(key) && !await store.has(key)) throw new Error('Este backup não inclui todos os arquivos do projeto.')
  }
  for (const { bytes, mime } of decoded.values()) await store.put(bytes, mime)
  return project
}
