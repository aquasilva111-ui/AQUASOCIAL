/**
 * AQUA DOCS metadata. The document content itself lives in a Y.Doc persisted
 * via y-indexeddb (web); this record is only what the home list needs.
 */
export type DocMeta = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}
