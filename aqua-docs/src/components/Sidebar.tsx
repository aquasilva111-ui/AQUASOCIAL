import {useEffect, useRef, useState} from 'react'
import type {DocMeta} from '../lib/docs'

export function Sidebar(props: {
  open: boolean
  docs: DocMeta[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.select()
  }, [editingId])

  const commitRename = () => {
    if (editingId)
      props.onRename(editingId, editingTitle.trim() || 'Sem título')
    setEditingId(null)
  }

  return (
    <aside className={`sidebar ${props.open ? 'open' : 'closed'}`}>
      <button className="btn-new-doc" onClick={props.onCreate}>
        + Novo documento
      </button>
      <nav className="doc-list">
        {props.docs.length === 0 && (
          <p className="doc-list-empty">Nenhum documento ainda.</p>
        )}
        {props.docs.map(doc => (
          <div
            key={doc.id}
            className={`doc-item ${doc.id === props.activeId ? 'active' : ''}`}
            onClick={() => props.onSelect(doc.id)}
            onDoubleClick={() => {
              setEditingId(doc.id)
              setEditingTitle(doc.title)
            }}>
            {editingId === doc.id ? (
              <input
                ref={inputRef}
                className="doc-rename-input"
                value={editingTitle}
                onChange={e => setEditingTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="doc-title">{doc.title || 'Sem título'}</span>
                <span className="doc-item-actions">
                  <button
                    className="doc-action"
                    title="Renomear"
                    aria-label={`Renomear ${doc.title}`}
                    onClick={e => {
                      e.stopPropagation()
                      setEditingId(doc.id)
                      setEditingTitle(doc.title)
                    }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                    </svg>
                  </button>
                  <button
                    className="doc-action"
                    title="Excluir"
                    aria-label={`Excluir ${doc.title}`}
                    onClick={e => {
                      e.stopPropagation()
                      if (
                        window.confirm(
                          `Excluir "${doc.title || 'Sem título'}"? Esta ação não pode ser desfeita.`,
                        )
                      ) {
                        props.onDelete(doc.id)
                      }
                    }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </span>
              </>
            )}
          </div>
        ))}
      </nav>
    </aside>
  )
}
