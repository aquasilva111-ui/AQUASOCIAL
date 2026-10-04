import { pt } from '@blocknote/core/locales'
import { withCollaboration } from '@blocknote/core/yjs'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { DOCS_FRAGMENT, docSession } from 'aqua-runtime/src/adapters/docs'

import { download, onProjectChange, runtime } from '../hub'
import DocAnalytics from './DocAnalytics'
import { IconButton } from './Icon'
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
  const [tab, setTab] = useState<'edit' | 'analytics'>('edit')
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
        <IconButton variant="ghost" icon="edit" text="Editor" label="Editor" active={tab === 'edit'} onClick={() => setTab('edit')} />
        <IconButton variant="ghost" icon="chart" text="Analytics" label="Analytics do documento" active={tab === 'analytics'} onClick={() => setTab('analytics')} />
        <span style={{ width: 1, height: 20, background: '#e3e5e8' }} />
        <IconButton variant="ghost" icon="download" text="Markdown" label="Baixar como Markdown" onClick={() => download(enc(editor.blocksToMarkdownLossy()), `${file}.md`, 'text/markdown')} />
        <IconButton variant="ghost" icon="download" text="HTML" label="Baixar como HTML" onClick={async () => download(enc(await editor.blocksToHTMLLossy()), `${file}.html`, 'text/html')} />
        <IconButton variant="ghost" icon="print" text="Imprimir" label="Imprimir" onClick={() => window.print()} />
        <span className="status">{saving ? 'Salvando…' : item ? `✓ Salvo às ${clock(item.updatedAt)}` : ''}</span>
      </div>
      {tab === 'analytics' && <DocAnalytics session={session} itemId={itemId} onEdit={() => setTab('edit')} />}
      <article className="paper" style={tab === 'analytics' ? { display: 'none' } : undefined}>
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
