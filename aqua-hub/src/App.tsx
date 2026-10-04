import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'

import type { ItemKind } from 'aqua-project/src/index'

import { KIND_LABEL, onProjectChange, runtime } from './hub'

const Design = lazy(() => import('./panels/DesignPanel'))
const Slides = lazy(() => import('./panels/PresentationPanel'))
const Chart = lazy(() => import('./panels/ChartPanel'))
const Music = lazy(() => import('./panels/MusicPanel'))
const Audio = lazy(() => import('./panels/AudioPanel'))
const Mix = lazy(() => import('./panels/MixPanel'))
const Video = lazy(() => import('./panels/VideoPanel'))
const Sheet = lazy(() => import('./panels/SheetPanel'))

const PANELS: Partial<Record<ItemKind, React.LazyExoticComponent<React.ComponentType<{ itemId: string }>>>> = {
  design: Design,
  presentation: Slides,
  chart: Chart,
  music: Music,
  audio: Audio,
  mix: Mix,
  video: Video,
  sheet: Sheet
}

export function App() {
  const project = useSyncExternalStore(onProjectChange, () => runtime.project)
  const [current, setCurrent] = useState<string | null>(null)
  const item = project.items.find((i) => i.id === current)

  useEffect(() => {
    const flush = () => void runtime.flush()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  const create = async (kind: ItemKind) => {
    const it = await runtime.create(kind, `${KIND_LABEL[kind]} ${project.items.filter((i) => i.kind === kind).length + 1}`)
    setCurrent(it.id)
  }
  const Panel = item && PANELS[item.kind]

  return (
    <div className="app">
      <aside className="side">
        <h1>AQUA Create · {project.name}</h1>
        <div className="new">
          {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
            <button key={k} onClick={() => create(k)}>
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {project.items.map((i) => (
          <button key={i.id} className={'item' + (i.id === current ? ' on' : '')} onClick={() => setCurrent(i.id)}>
            {i.name}
            <small>
              {KIND_LABEL[i.kind] ?? i.kind} · {new Date(i.updatedAt).toLocaleString()}
            </small>
          </button>
        ))}
        {!project.items.length && <p className="note">Crie o primeiro item acima. Tudo fica salvo neste navegador.</p>}
      </aside>
      <main className="main">
        {item && Panel ? (
          <>
            <div className="bar">
              <h2>{item.name}</h2>
              <button
                onClick={() => {
                  const name = prompt('Novo nome', item.name)
                  if (name) runtime.rename(item.id, name)
                }}
              >
                Renomear
              </button>
              <button
                onClick={async () => {
                  if (confirm(`Apagar "${item.name}"?`)) {
                    await runtime.remove(item.id)
                    setCurrent(null)
                  }
                }}
              >
                Apagar
              </button>
            </div>
            <div className="body">
              <Suspense fallback={<p className="note">Carregando editor…</p>}>
                <Panel key={item.id} itemId={item.id} />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="empty">Escolha ou crie um item.</div>
        )}
      </main>
    </div>
  )
}
