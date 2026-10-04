import {useEffect, useRef, useState} from 'react'
import type {Mode} from '../lib/settings'

export function TopBar(props: {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  title: string
  onTitleChange: (title: string) => void
  mode: Mode
  onToggleMode: () => void
  collabActive: boolean
  onPublish: () => void
  onExportMarkdown: () => void
  onExportHtml: () => void
}) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    const close = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [exportOpen])

  return (
    <header className="topbar">
      <button
        className="icon-btn"
        onClick={props.onToggleSidebar}
        title={
          props.sidebarOpen
            ? 'Recolher barra lateral'
            : 'Expandir barra lateral'
        }
        aria-label={
          props.sidebarOpen
            ? 'Recolher barra lateral'
            : 'Expandir barra lateral'
        }>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <div className="wordmark">
        <span className="wordmark-aqua">AQUA</span>
        <span className="wordmark-docs">Docs</span>
      </div>

      <input
        className="title-input"
        value={props.title}
        onChange={e => props.onTitleChange(e.target.value)}
        placeholder="Sem título"
        aria-label="Título do documento"
      />

      {props.collabActive && (
        <span
          className="collab-badge"
          title="Sincronização em tempo real via WebRTC">
          <span className="collab-dot" />
          Colaboração ativa
        </span>
      )}

      <div className="topbar-actions">
        <button
          className="icon-btn"
          onClick={props.onToggleMode}
          title={
            props.mode === 'dark'
              ? 'Mudar para tema claro'
              : 'Mudar para tema escuro'
          }
          aria-label="Alternar tema">
          {props.mode === 'dark' ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
              <line x1="4.9" y1="4.9" x2="7" y2="7" />
              <line x1="17" y1="17" x2="19.1" y2="19.1" />
              <line x1="4.9" y1="19.1" x2="7" y2="17" />
              <line x1="17" y1="7" x2="19.1" y2="4.9" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </button>

        <div className="export-menu" ref={exportRef}>
          <button className="btn-ghost" onClick={() => setExportOpen(o => !o)}>
            Exportar
          </button>
          {exportOpen && (
            <div className="export-dropdown">
              <button
                onClick={() => {
                  setExportOpen(false)
                  props.onExportMarkdown()
                }}>
                Markdown (.md)
              </button>
              <button
                onClick={() => {
                  setExportOpen(false)
                  props.onExportHtml()
                }}>
                HTML (.html)
              </button>
            </div>
          )}
        </div>

        <button className="btn-primary" onClick={props.onPublish}>
          Publicar no Aqua
        </button>
      </div>
    </header>
  )
}
