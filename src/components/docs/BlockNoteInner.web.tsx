import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {ActivityIndicator, View} from 'react-native'
import {withCollaboration} from '@blocknote/core/yjs'
import {BlockNoteView} from '@blocknote/mantine'
import {useCreateBlockNote} from '@blocknote/react'
import {IndexeddbPersistence} from 'y-indexeddb'
import * as Y from 'yjs'

import {useDocsApi} from '#/state/docs/store'
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {useThemeName} from '#/alf/util/useColorModeTheme'

const FONT_STACK = `'Trueno', 'InterVariable', sans-serif`

/**
 * The heavy AQUA DOCS editor: BlockNote UI over a per-document Y.Doc
 * persisted locally via y-indexeddb. FASE 2 plugs a y-websocket provider
 * into the same fragment for real-time sync.
 */
export default function BlockNoteInner({docId}: {docId: string}) {
  const t = useTheme()
  const [ready, setReady] = useState(false)

  const ydoc = useMemo(() => new Y.Doc(), [])
  const persistence = useMemo(
    () => new IndexeddbPersistence(`aqua-doc-${docId}`, ydoc),
    [docId, ydoc],
  )

  useEffect(() => {
    let cancelled = false
    persistence.whenSynced.then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
      persistence.destroy()
      ydoc.destroy()
    }
  }, [persistence, ydoc])

  if (!ready) {
    return (
      <View style={[a.flex_1, a.align_center, a.justify_center]}>
        <ActivityIndicator color={t.palette.primary_500} />
      </View>
    )
  }

  return <SyncedEditor docId={docId} ydoc={ydoc} />
}

function SyncedEditor({docId, ydoc}: {docId: string; ydoc: Y.Doc}) {
  const themeName = useThemeName()
  const {currentAccount} = useSession()
  const {touchDoc} = useDocsApi()

  const editor = useCreateBlockNote(
    withCollaboration({
      collaboration: {
        fragment: ydoc.getXmlFragment('document-store'),
        user: {
          name: currentAccount?.handle ?? 'você',
          color: '#0b5cff',
        },
      },
    }),
    [docId, ydoc],
  )

  useEffect(() => {
    const style = document.createElement('style')
    style.dataset.aquaDocsFont = 'trueno'
    style.textContent = `.aqua-docs-editor .bn-editor { font-family: ${FONT_STACK}; }`
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  const touchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  useEffect(() => () => clearTimeout(touchTimer.current), [])

  const onChange = useCallback(() => {
    clearTimeout(touchTimer.current)
    touchTimer.current = setTimeout(() => touchDoc(docId), 2000)
  }, [docId, touchDoc])

  return (
    <View style={[a.flex_1]}>
      <BlockNoteView
        editor={editor}
        theme={themeName === 'light' ? 'light' : 'dark'}
        onChange={onChange}
        className="aqua-docs-editor"
        style={{flex: 1, overflowY: 'auto'}}
      />
    </View>
  )
}
