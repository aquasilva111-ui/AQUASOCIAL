export type DocMeta = {
  id: string
  title: string
  updatedAt: number
}

const INDEX_KEY = 'aqua-docs:index'
const ACTIVE_KEY = 'aqua-docs:active'

export function loadDocIndex(): DocMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    const docs = JSON.parse(raw) as DocMeta[]
    return docs.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function saveDocIndex(docs: DocMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(docs))
}

export function createDocMeta(
  docs: DocMeta[],
  title = 'Sem título',
): {docs: DocMeta[]; doc: DocMeta} {
  const doc: DocMeta = {
    id: crypto.randomUUID(),
    title,
    updatedAt: Date.now(),
  }
  const next = [doc, ...docs]
  saveDocIndex(next)
  return {docs: next, doc}
}

export function renameDocMeta(
  docs: DocMeta[],
  id: string,
  title: string,
): DocMeta[] {
  const next = docs.map(d => (d.id === id ? {...d, title} : d))
  saveDocIndex(next)
  return next
}

export function touchDocMeta(docs: DocMeta[], id: string): DocMeta[] {
  const next = docs
    .map(d => (d.id === id ? {...d, updatedAt: Date.now()} : d))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  saveDocIndex(next)
  return next
}

/** Nome do banco IndexedDB (y-indexeddb) que guarda o conteúdo do documento. */
export function docDbName(id: string) {
  return `aqua-docs:${id}`
}

export function deleteDocMeta(docs: DocMeta[], id: string): DocMeta[] {
  const next = docs.filter(d => d.id !== id)
  saveDocIndex(next)
  try {
    indexedDB.deleteDatabase(docDbName(id))
  } catch {
    // IndexedDB indisponível: o índice já foi limpo, o banco órfão é inofensivo.
  }
  return next
}

export function loadActiveDocId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveDocId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id)
}
