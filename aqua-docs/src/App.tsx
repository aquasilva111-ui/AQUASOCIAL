import {useCallback, useMemo, useRef, useState} from 'react'
import {DocEditor, type EditorHandle} from './components/DocEditor'
import {Sidebar} from './components/Sidebar'
import {TopBar} from './components/TopBar'
import {
  createDocMeta,
  deleteDocMeta,
  loadActiveDocId,
  loadDocIndex,
  renameDocMeta,
  saveActiveDocId,
  touchDocMeta,
  type DocMeta,
} from './lib/docs'
import {downloadHtml, downloadMarkdown, publishToAqua} from './lib/publish'
import {useThemeMode, useUrlParams} from './lib/settings'

function useInitialDocs(): {docs: DocMeta[]; activeId: string} {
  return useMemo(() => {
    let docs = loadDocIndex()
    if (docs.length === 0) {
      const created = createDocMeta([])
      docs = created.docs
    }
    const saved = loadActiveDocId()
    const activeId = docs.find(d => d.id === saved)?.id ?? docs[0].id
    saveActiveDocId(activeId)
    return {docs, activeId}
  }, [])
}

export default function App() {
  const {mode, toggle} = useThemeMode()
  const {host, room} = useUrlParams()
  const initial = useInitialDocs()
  const [docs, setDocs] = useState<DocMeta[]>(initial.docs)
  const [activeId, setActiveId] = useState<string>(initial.activeId)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const editorHandle = useRef<EditorHandle | null>(null)
  const lastTouch = useRef(0)

  const activeDoc = docs.find(d => d.id === activeId) ?? docs[0]

  const selectDoc = useCallback((id: string) => {
    setActiveId(id)
    saveActiveDocId(id)
  }, [])

  const createDoc = useCallback(() => {
    setDocs(prev => {
      const {docs: next, doc} = createDocMeta(prev)
      setActiveId(doc.id)
      saveActiveDocId(doc.id)
      return next
    })
  }, [])

  const renameDoc = useCallback((id: string, title: string) => {
    setDocs(prev => renameDocMeta(prev, id, title))
  }, [])

  const deleteDoc = useCallback(
    (id: string) => {
      setDocs(prev => {
        let next = deleteDocMeta(prev, id)
        if (next.length === 0) {
          next = createDocMeta(next).docs
        }
        if (id === activeId) {
          const fallback = next[0].id
          setActiveId(fallback)
          saveActiveDocId(fallback)
        }
        return next
      })
    },
    [activeId],
  )

  // Atualiza "updatedAt" do documento, com limite de 1x a cada 2s por digitação.
  const handleEditorChange = useCallback(() => {
    const now = Date.now()
    if (now - lastTouch.current < 2000) return
    lastTouch.current = now
    setDocs(prev => touchDocMeta(prev, activeId))
  }, [activeId])

  const handleEditorReady = useCallback((handle: EditorHandle) => {
    editorHandle.current = handle
  }, [])

  const exportMarkdown = useCallback(() => {
    if (!editorHandle.current || !activeDoc) return
    downloadMarkdown(activeDoc.title, editorHandle.current.exportMarkdown())
  }, [activeDoc])

  const exportHtml = useCallback(() => {
    if (!editorHandle.current || !activeDoc) return
    downloadHtml(activeDoc.title, editorHandle.current.exportHtml())
  }, [activeDoc])

  const publish = useCallback(() => {
    if (!editorHandle.current || !activeDoc) return
    publishToAqua({
      host,
      title: activeDoc.title,
      markdown: editorHandle.current.exportMarkdown(),
      html: editorHandle.current.exportHtml(),
    })
  }, [host, activeDoc])

  if (!activeDoc) return null

  return (
    <div className="app">
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        title={activeDoc.title}
        onTitleChange={title => renameDoc(activeDoc.id, title)}
        mode={mode}
        onToggleMode={toggle}
        collabActive={room !== null}
        onPublish={publish}
        onExportMarkdown={exportMarkdown}
        onExportHtml={exportHtml}
      />
      <div className="body">
        <Sidebar
          open={sidebarOpen}
          docs={docs}
          activeId={activeDoc.id}
          onSelect={selectDoc}
          onCreate={createDoc}
          onRename={renameDoc}
          onDelete={deleteDoc}
        />
        <main className="editor-area">
          <div className="editor-card">
            <DocEditor
              key={`${activeDoc.id}:${room ?? 'local'}`}
              docId={activeDoc.id}
              room={room}
              mode={mode}
              onReady={handleEditorReady}
              onChange={handleEditorChange}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
