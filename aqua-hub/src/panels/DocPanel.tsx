import { pt } from '@blocknote/core/locales'
import { withCollaboration } from '@blocknote/core/yjs'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

import { DOCS_FRAGMENT, docSession } from 'aqua-runtime/src/adapters/docs'

import { download } from '../hub'
import { useSession } from './hooks'

type DocSession = ReturnType<typeof docSession>

/** Images are kept inside the document itself as data URLs. */
const uploadFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

function Editor({ session, name }: { session: DocSession; name: string }) {
  // BlockNote 0.55 only binds to Yjs through withCollaboration; a bare `collaboration` option is ignored.
  const editor = useCreateBlockNote(
    withCollaboration({
      dictionary: pt,
      uploadFile,
      tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
      collaboration: { fragment: session.doc.getXmlFragment(DOCS_FRAGMENT), user: { name: 'Você', color: '#002BEF' }, showCursorLabels: 'activity' }
    })
  )
  const file = (name || 'documento').replace(/[^\w-]+/g, '_')
  return (
    <>
      <div className="row">
        <button onClick={() => download(new TextEncoder().encode(editor.blocksToMarkdownLossy()), `${file}.md`, 'text/markdown')}>Baixar Markdown</button>
        <button onClick={async () => download(new TextEncoder().encode(await editor.blocksToHTMLLossy()), `${file}.html`, 'text/html')}>Baixar HTML</button>
        <span className="note">Desfazer/refazer: Ctrl/⌘+Z dentro do editor. Digite “/” para blocos.</span>
      </div>
      <BlockNoteView editor={editor} theme="light" />
    </>
  )
}

export default function DocPanel({ itemId }: { itemId: string }) {
  const { session } = useSession<DocSession>(itemId)
  if (!session) return <p className="note">Abrindo…</p>
  return <Editor session={session} name={itemId} />
}
