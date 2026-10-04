import { pt } from '@blocknote/core/locales'
import { withCollaboration } from '@blocknote/core/yjs'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { DOCS_FRAGMENT, docSession } from 'aqua-runtime/src/adapters/docs'

import { download, onProjectChange, runtime } from '../hub'
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

const clock = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function Page({ session, itemId }: { session: DocSession; itemId: string }) {
  const project = useSyncExternalStore(onProjectChange, () => runtime.project)
  const item = project.items.find((i) => i.id === itemId)
  const [saving, setSaving] = useState(false)
  useEffect(() => session.onChange(() => setSaving(true)), [session])
  useEffect(() => onProjectChange(() => setSaving(false)), [])

  // BlockNote 0.55 only binds to Yjs through withCollaboration; a bare `collaboration` option is ignored.
  const editor = useCreateBlockNote(
    withCollaboration({
      dictionary: pt,
      uploadFile,
      tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
      collaboration: { fragment: session.doc.getXmlFragment(DOCS_FRAGMENT), user: { name: 'Você', color: '#002BEF' }, showCursorLabels: 'activity' }
    })
  )
  const file = (item?.name || 'documento').replace(/[^\w-]+/g, '_')
  const enc = (s: string) => new TextEncoder().encode(s)

  return (
    <div className="docwrap">
      <div className="doctools">
        <button onClick={() => download(enc(editor.blocksToMarkdownLossy()), `${file}.md`, 'text/markdown')}>⬇ Markdown</button>
        <button onClick={async () => download(enc(await editor.blocksToHTMLLossy()), `${file}.html`, 'text/html')}>⬇ HTML</button>
        <button onClick={() => window.print()}>🖨 Imprimir</button>
        <span className="status">{saving ? 'Salvando…' : item ? `✓ Salvo às ${clock(item.updatedAt)}` : ''}</span>
      </div>
      <article className="paper">
        <input
          className="doctitle"
          placeholder="Sem título"
          value={item?.name ?? ''}
          onChange={(e) => runtime.rename(itemId, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), editor.focus())}
        />
        <BlockNoteView editor={editor} theme="light" />
      </article>
    </div>
  )
}

export default function DocPanel({ itemId }: { itemId: string }) {
  const { session } = useSession<DocSession>(itemId)
  if (!session) return <p className="note">Abrindo…</p>
  return <Page session={session} itemId={itemId} />
}
