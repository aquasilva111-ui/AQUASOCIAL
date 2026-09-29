import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {nanoid} from 'nanoid/non-secure'

import {type DocMeta} from '#/lib/docs/types'
import {useSession} from '#/state/session'
import {account} from '#/storage'

const KEY = 'aquaDocs'

const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const snapshots = new Map<string, DocMeta[] | undefined>()

function read(did: string): DocMeta[] | undefined {
  const id = `${did}:${KEY}`
  if (!snapshots.has(id)) snapshots.set(id, account.get([did, KEY]))
  return snapshots.get(id)
}

function write(did: string, docs: DocMeta[]) {
  account.set([did, KEY], docs)
  snapshots.set(`${did}:${KEY}`, docs)
  emit()
}

export function useDocs(): DocMeta[] {
  const {currentAccount} = useSession()
  const docs = useSyncExternalStore(subscribe, () =>
    currentAccount ? read(currentAccount.did) : undefined,
  )
  return useMemo(
    () =>
      [...(docs ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [docs],
  )
}

export function useDoc(id: string): DocMeta | undefined {
  return useDocs().find(doc => doc.id === id)
}

export function useDocsApi() {
  const {currentAccount} = useSession()
  const did = currentAccount?.did

  const createDoc = useCallback(
    (title?: string): DocMeta | undefined => {
      if (!did) return undefined
      const now = new Date().toISOString()
      const doc: DocMeta = {
        id: nanoid(),
        title: title?.trim() || 'Documento sem título',
        createdAt: now,
        updatedAt: now,
      }
      write(did, [doc, ...(read(did) ?? [])])
      return doc
    },
    [did],
  )

  const renameDoc = useCallback(
    (id: string, title: string) => {
      if (!did) return
      write(
        did,
        (read(did) ?? []).map(doc =>
          doc.id === id
            ? {...doc, title, updatedAt: new Date().toISOString()}
            : doc,
        ),
      )
    },
    [did],
  )

  const touchDoc = useCallback(
    (id: string) => {
      if (!did) return
      write(
        did,
        (read(did) ?? []).map(doc =>
          doc.id === id ? {...doc, updatedAt: new Date().toISOString()} : doc,
        ),
      )
    },
    [did],
  )

  const removeDoc = useCallback(
    (id: string) => {
      if (!did) return
      write(
        did,
        (read(did) ?? []).filter(doc => doc.id !== id),
      )
    },
    [did],
  )

  return {createDoc, renameDoc, touchDoc, removeDoc}
}
