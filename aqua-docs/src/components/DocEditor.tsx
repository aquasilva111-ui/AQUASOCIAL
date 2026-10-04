import {pt} from '@blocknote/core/locales'
import {withCollaboration} from '@blocknote/core/yjs'
import {BlockNoteView} from '@blocknote/mantine'
import {BlockNoteContext, useCreateBlockNote} from '@blocknote/react'
import {memo, useEffect, useState} from 'react'
import * as Y from 'yjs'
import {IndexeddbPersistence} from 'y-indexeddb'
import {WebrtcProvider} from 'y-webrtc'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

import {AQUA} from '../lib/brand'
import {docDbName} from '../lib/docs'
import {aquaDarkTheme, aquaLightTheme} from '../lib/theme'
import type {Mode} from '../lib/settings'

const CURSOR_COLORS = [AQUA.blue, AQUA.orange, '#0a9e6e', '#8b5cf6', '#d63384']

function randomUser() {
  return {
    name: 'Você',
    color: CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)],
  }
}

/** Upload de imagens: guarda o arquivo como data URL dentro do próprio documento. */
async function uploadFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export type EditorHandle = {
  exportMarkdown: () => string
  exportHtml: () => string
}

type Props = {
  docId: string
  room: string | null
  mode: Mode
  onReady: (handle: EditorHandle) => void
  onChange: () => void
}

type Collab = {fragment: Y.XmlFragment; provider: WebrtcProvider | null}

export const DocEditor = memo(function DocEditor(props: Props) {
  const {docId, room} = props
  const [collab, setCollab] = useState<Collab | null>(null)

  // Um Y.Doc por documento: conteúdo persistido no IndexedDB (y-indexeddb); com ?room=, um provider
  // y-webrtc sincroniza em tempo real. Tudo é criado e destruído no mesmo efeito (o StrictMode roda
  // o cleanup uma vez antes de valer), e o editor só monta depois que o IndexedDB carregou o
  // documento: criado antes, o BlockNote insere um primeiro bloco vazio que colide com o conteúdo salvo.
  useEffect(() => {
    let live = true
    setCollab(null)
    const ydoc = new Y.Doc()
    const persistence = new IndexeddbPersistence(docDbName(docId), ydoc)
    // A sala de colaboração tem escopo por documento, para não misturar docs.
    const provider = room
      ? new WebrtcProvider(`aqua-docs:${room}:${docId}`, ydoc)
      : null
    void persistence.whenSynced.then(() => {
      if (live)
        setCollab({fragment: ydoc.getXmlFragment('document-store'), provider})
    })
    return () => {
      live = false
      provider?.destroy()
      void persistence.destroy()
      ydoc.destroy()
    }
  }, [docId, room])

  return collab ? (
    <EditorBody key={`${docId}:${room}`} collab={collab} {...props} />
  ) : null
})

function EditorBody(props: Props & {collab: Collab}) {
  const {mode, collab} = props

  // BlockNote 0.55 só liga ao Yjs via withCollaboration; a opção `collaboration` solta é ignorada.
  const editor = useCreateBlockNote(
    withCollaboration({
      dictionary: pt,
      uploadFile,
      tables: {
        splitCells: true,
        cellBackgroundColor: true,
        cellTextColor: true,
        headers: true,
      },
      collaboration: {
        fragment: collab.fragment,
        user: randomUser(),
        provider: collab.provider ?? undefined,
        showCursorLabels: 'activity',
      },
    }),
  )

  useEffect(() => {
    props.onReady({
      exportMarkdown: () => editor.blocksToMarkdownLossy(),
      exportHtml: () => editor.blocksToHTMLLossy(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return (
    <BlockNoteContext.Provider value={{colorSchemePreference: mode}}>
      <BlockNoteView
        editor={editor}
        theme={{light: aquaLightTheme, dark: aquaDarkTheme}}
        onChange={props.onChange}
        className="aqua-docs-editor"
      />
    </BlockNoteContext.Provider>
  )
}
