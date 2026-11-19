import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { ItemKind, ProjectItem } from 'aqua-project/src/index'
import { publishToAqua } from 'aqua-runtime/src/publish'

import { collabActive, onProjectChange, runtime } from '../hub'
import { askAi } from './ai'
import {
  CreateEye,
  CreateEyeOnDisc,
  HomeIcon,
  MoonIcon,
  ProfileIcon,
  RedoIcon,
  RulerGlyph,
  SearchIcon,
  Star4,
  SunIcon,
  ToolMark,
  UndoIcon
} from './icons'
import { hrefFor, parseCreatePath, sameRoute, type Route, type ToolId } from './route'
import { readScheme, writeScheme, type Scheme } from './scheme'
import { toolById, toolForKind, TOOLS, type ToolDef } from './tools'

import './shell.css'

const Doc = lazy(() => import('../panels/DocPanel'))
const Design = lazy(() => import('../panels/DesignPanel'))
const Slides = lazy(() => import('../panels/PresentationPanel'))
const Chart = lazy(() => import('../panels/ChartPanel'))
const Music = lazy(() => import('../panels/MusicPanel'))
const Audio = lazy(() => import('../panels/AudioPanel'))
const Mix = lazy(() => import('../panels/MixPanel'))
const Video = lazy(() => import('../panels/VideoPanel'))
const Sheet = lazy(() => import('../panels/SheetPanel'))

const PANELS: Partial<Record<ItemKind, React.LazyExoticComponent<React.ComponentType<{ itemId: string }>>>> = {
  doc: Doc,
  design: Design,
  presentation: Slides,
  chart: Chart,
  music: Music,
  audio: Audio,
  mix: Mix,
  video: Video,
  sheet: Sheet
}

const PROFILE_HREF = 'https://aquaapp.systems/profile'

function useReducedMotion() {
  const [reduce, setReduce] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduce(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduce
}

function useCreateRoute() {
  const [route, setRoute] = useState<Route>(() => parseCreatePath(location.pathname) ?? { name: 'launcher' })
  useEffect(() => {
    const sync = () => setRoute(parseCreatePath(location.pathname) ?? { name: 'launcher' })
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const go = useCallback((next: Route, mode: 'push' | 'replace' = 'push') => {
    const url = hrefFor(next, location.search)
    if (url !== location.pathname + location.search) {
      history[mode === 'push' ? 'pushState' : 'replaceState']({ create: true }, '', url)
    }
    setRoute(next)
  }, [])
  return { route, go }
}

function frameClass(route: Route, shown: Route, leaving: Route | null) {
  if (leaving && sameRoute(route, leaving)) return `view ghost ${route.name === 'launcher' ? 'leave-a' : 'leave-b'}`
  if (leaving && sameRoute(route, shown)) return `view ${route.name === 'workspace' ? 'enter-b' : 'enter-a'}`
  return 'view'
}

async function createItem(tool: ToolDef) {
  if (!tool.kind) return null
  const count = runtime.project.items.filter((item) => item.kind === tool.kind).length + 1
  return runtime.create(tool.kind, `${tool.label} ${count}`)
}

export function CreateShell() {
  const project = useSyncExternalStore(onProjectChange, () => runtime.project)
  const { route, go } = useCreateRoute()
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(route)
  const [leaving, setLeaving] = useState<Route | null>(null)
  const [scheme, setScheme] = useState<Scheme>(() => readScheme())
  const [search, setSearch] = useState(false)

  useEffect(() => {
    const flush = () => void runtime.flush()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  useEffect(() => {
    setShown((current) => {
      if (!sameRoute(route, current) && !reduce) setLeaving(current)
      return sameRoute(route, current) ? current : route
    })
    // Always schedule the clear. React's dev double-invoke drops the first timer,
    // and the second pass still has to retire the outgoing screen.
    const timer = window.setTimeout(() => setLeaving(null), reduce ? 0 : 260)
    return () => window.clearTimeout(timer)
  }, [route, reduce])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (search) {
        setSearch(false)
        return
      }
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (route.name === 'workspace') {
        event.preventDefault()
        go({ name: 'launcher' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, route, search])

  const toggleScheme = () => {
    const next: Scheme = scheme === 'light' ? 'night' : 'light'
    writeScheme(next)
    setScheme(next)
  }

  const openTool = (tool: ToolId) => go({ name: 'workspace', tool })
  const openItem = (item: ProjectItem) => {
    const tool = toolForKind(item.kind)
    if (!tool) return
    go({ name: 'workspace', tool: tool.id, itemId: item.id })
  }
  const home = () => go({ name: 'launcher' })

  const launcherProps = {
    projectName: project.name,
    items: project.items,
    scheme,
    onToggleScheme: toggleScheme,
    onTool: openTool,
    onItem: openItem
  }
  const workspaceProps = {
    scheme,
    onToggleScheme: toggleScheme,
    onHome: home,
    onOpen: (itemId: string) => {
      if (shown.name !== 'workspace') return
      go({ name: 'workspace', tool: shown.tool, itemId })
    }
  }

  return (
    <div className="create" data-scheme={scheme} data-screen={shown.name}>
      <Rail route={route} onHome={home} onTool={openTool} />
      <div className="stage">
        {shown.name === 'launcher' && (
          <div className={frameClass(shown, shown, leaving)} data-live="true">
            <Launcher ghost={false} {...launcherProps} />
          </div>
        )}
        {leaving?.name === 'launcher' && !sameRoute(leaving, shown) && (
          <div className={frameClass(leaving, shown, leaving)} aria-hidden="true">
            <Launcher ghost {...launcherProps} />
          </div>
        )}
        {shown.name === 'workspace' && (
          <div className={frameClass(shown, shown, leaving)} data-live="true">
            <Workspace ghost={false} route={shown} {...workspaceProps} />
          </div>
        )}
        {leaving?.name === 'workspace' && !sameRoute(leaving, shown) && (
          <div className={frameClass(leaving, shown, leaving)} aria-hidden="true">
            <Workspace ghost route={leaving} {...workspaceProps} />
          </div>
        )}
      </div>
      <Dock
        route={route}
        onHome={home}
        onSearch={() => setSearch(true)}
        onCreate={() => {
          if (route.name === 'workspace') home()
        }}
        onAi={() => {
          if (route.name === 'launcher') {
            document.querySelector<HTMLElement>('[data-live="true"] .card')?.focus()
            return
          }
          document.querySelector<HTMLElement>('[data-live="true"] .ai-btn')?.click()
        }}
      />
      {search && (
        <Search
          items={project.items}
          onClose={() => setSearch(false)}
          onTool={(id) => {
            setSearch(false)
            openTool(id)
          }}
          onItem={(item) => {
            setSearch(false)
            openItem(item)
          }}
        />
      )}
    </div>
  )
}

function Rail({ route, onHome, onTool }: { route: Route; onHome: () => void; onTool: (tool: ToolId) => void }) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const root = useRef<HTMLElement>(null)
  const timers = useRef({ open: null as number | null, close: null as number | null })

  const clearTimers = () => {
    if (timers.current.open) window.clearTimeout(timers.current.open)
    if (timers.current.close) window.clearTimeout(timers.current.close)
    timers.current.open = null
    timers.current.close = null
  }
  const scheduleOpen = () => {
    clearTimers()
    timers.current.open = window.setTimeout(() => setOpen(true), reduce ? 0 : 120)
  }
  const scheduleClose = () => {
    clearTimers()
    timers.current.close = window.setTimeout(() => setOpen(false), reduce ? 0 : 100)
  }

  useEffect(() => clearTimers, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const inWorkspace = route.name === 'workspace'
  const shortcuts: { id: string; label: string; tool: ToolId; icon: 'title' | 'note' | 'cube' }[] = [
    { id: 'write', label: 'Write', tool: 'write', icon: 'title' },
    { id: 'music', label: 'Melody', tool: 'music', icon: 'note' },
    { id: 'cube', label: 'Estúdio 3D', tool: 'cube', icon: 'cube' }
  ]

  return (
    <nav
      ref={root}
      className={open ? 'rail glass open' : 'rail glass'}
      aria-label="Create"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClose()
      }}
    >
      <ul className="rail-list">
        <li>
          <button type="button" className="cbtn rail-item" aria-current={inWorkspace ? undefined : 'page'} aria-label="Início" onClick={onHome}>
            <span className="rail-icon">
              <HomeIcon />
            </span>
            <span className="rail-label">Início</span>
          </button>
        </li>
        {shortcuts.map((item) => (
          <li key={item.id}>
            <button type="button" className="cbtn rail-item" aria-label={item.label} onClick={() => onTool(item.tool)}>
              <span className="rail-icon">
                <RulerGlyph icon={item.icon} size={24} />
              </span>
              <span className="rail-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="rail-spacer" />
      <button
        type="button"
        className="cbtn rail-eye"
        aria-label={inWorkspace ? 'Voltar ao lançador' : 'Criar'}
        aria-current={inWorkspace ? 'page' : undefined}
        onClick={() => {
          if (inWorkspace) onHome()
        }}
      >
        <span className="rail-icon">
          <CreateEyeOnDisc size={26} />
        </span>
        <span className="rail-label">Criar</span>
      </button>
    </nav>
  )
}

function Launcher({
  ghost,
  projectName,
  items,
  scheme,
  onToggleScheme,
  onTool,
  onItem
}: {
  ghost: boolean
  projectName: string
  items: ProjectItem[]
  scheme: Scheme
  onToggleScheme: () => void
  onTool: (tool: ToolId) => void
  onItem: (item: ProjectItem) => void
}) {
  const recents = [...items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return (
    <div className="launcher" aria-hidden={ghost || undefined}>
      <header className="launcher-head glass">
        <div className="brand">
          <CreateEye size={28} />
          <span className="brand-name">AQUA Create</span>
          {collabActive && <span className="collab-dot" role="img" aria-label="Colaboração ativa" />}
          <span className="brand-project">{projectName}</span>
        </div>
        <div className="head-actions">
          <button type="button" className="cbtn ai-text" aria-label="Criar com IA" onClick={() => document.querySelector<HTMLElement>('[data-live="true"] .card')?.focus()}>
            <Star4 size={16} />
            <span className="ai-text-label">Criar com IA</span>
          </button>
          <ModeButton scheme={scheme} onToggle={onToggleScheme} />
        </div>
      </header>
      <h1 className="ask">O que você quer criar?</h1>
      <ul className="card-grid">
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <button type="button" className="cbtn card glass" onClick={() => onTool(tool.id)}>
              <ToolMark id={tool.id} />
              <span className="card-title">{tool.label}</span>
              <p>{tool.description}</p>
              <span className="chip">{tool.chip}</span>
            </button>
          </li>
        ))}
      </ul>
      <section className="recents" aria-label="Recentes no projeto">
        <h2>Recentes no projeto</h2>
        {recents.length === 0 ? (
          <p className="quiet">Nada ainda neste projeto. Escolha uma ferramenta acima.</p>
        ) : (
          <ul className="recent-list">
            {recents.map((item) => {
              const tool = toolForKind(item.kind)
              if (!tool) return null
              return (
                <li key={item.id}>
                  <button type="button" className="cbtn recent glass" onClick={() => onItem(item)}>
                    <ToolMark id={tool.id} />
                    <b>{item.name}</b>
                    <small>
                      {tool.label} · {new Date(item.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </small>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Workspace({
  ghost,
  route,
  scheme,
  onToggleScheme,
  onHome,
  onOpen
}: {
  ghost: boolean
  route: Extract<Route, { name: 'workspace' }>
  scheme: Scheme
  onToggleScheme: () => void
  onHome: () => void
  onOpen: (itemId: string) => void
}) {
  const project = useSyncExternalStore(onProjectChange, () => runtime.project)
  const tool = toolById(route.tool)
  const item = route.itemId ? project.items.find((entry) => entry.id === route.itemId && entry.kind === tool.kind) : undefined
  const Panel = item ? PANELS[item.kind] : undefined
  const [ruler, setRuler] = useState(tool.ruler[0]?.id ?? '')
  const [zoom, setZoom] = useState(100)
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setRuler(tool.ruler[0]?.id ?? '')
    setZoom(100)
    setMenu(false)
  }, [tool])

  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenu(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menu])

  const start = async () => {
    if (ghost || busy || !tool.kind) return
    setBusy(true)
    try {
      const created = await createItem(tool)
      if (created) onOpen(created.id)
    } finally {
      setBusy(false)
    }
  }

  const onAi = async () => {
    if (ghost || tool.id !== 'music') return
    if (!item) {
      askAi('music')
      await start()
      return
    }
    askAi('music')
  }

  const onUndo = () => {
    if (!item) return
    try {
      if (runtime.undo(item.id)) window.dispatchEvent(new CustomEvent('aqua-hub:history', { detail: { itemId: item.id } }))
    } catch {
      /* editor still opening */
    }
  }
  const onRedo = () => {
    if (!item) return
    try {
      if (runtime.redo(item.id)) window.dispatchEvent(new CustomEvent('aqua-hub:history', { detail: { itemId: item.id } }))
    } catch {
      /* editor still opening */
    }
  }

  const rulerBar = (
    <>
      {tool.ruler.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="cbtn ruler-btn"
          aria-label={entry.label}
          aria-pressed={ruler === entry.id}
          onClick={() => setRuler(entry.id)}
        >
          <RulerGlyph icon={entry.icon} />
        </button>
      ))}
    </>
  )

  return (
    <div className="workspace" aria-hidden={ghost || undefined}>
      <div className="toolbar glass">
        <button type="button" className="cbtn tool-home" aria-label="Início" onClick={onHome}>
          <HomeIcon size={20} />
          <span className="home-label">Início</span>
        </button>
        <button type="button" className="cbtn icon-btn" aria-label="Desfazer" disabled={!item} onClick={onUndo}>
          <UndoIcon />
        </button>
        <button type="button" className="cbtn icon-btn" aria-label="Refazer" disabled={!item} onClick={onRedo}>
          <RedoIcon />
        </button>
        <div className="piece">
          {item ? (
            <>
              <button type="button" className="cbtn piece-name" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((open) => !open)}>
                {item.name}
              </button>
              {menu && (
                <div className="menu glass" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="cbtn"
                    onClick={() => {
                      setMenu(false)
                      const name = prompt('Novo nome', item.name)
                      if (name) runtime.rename(item.id, name)
                    }}
                  >
                    Renomear
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="cbtn"
                    onClick={async () => {
                      setMenu(false)
                      if (confirm(`Apagar "${item.name}"?`)) {
                        await runtime.remove(item.id)
                        onHome()
                      }
                    }}
                  >
                    Apagar
                  </button>
                </div>
              )}
            </>
          ) : (
            <span className="piece-name">{tool.empty}</span>
          )}
        </div>
        <div className="zoom">
          <button type="button" className="cbtn icon-btn" aria-label="Diminuir zoom" onClick={() => setZoom((value) => Math.max(50, value - 25))}>
            −
          </button>
          <span aria-live="polite">{zoom}%</span>
          <button type="button" className="cbtn icon-btn" aria-label="Aumentar zoom" onClick={() => setZoom((value) => Math.min(150, value + 25))}>
            +
          </button>
        </div>
        <button type="button" className="cbtn ai-btn" onClick={() => void onAi()}>
          <Star4 size={16} />
          <span>{tool.ai}</span>
        </button>
        <ModeButton scheme={scheme} onToggle={onToggleScheme} />
        <button
          type="button"
          className="cbtn publish"
          aria-label="Publicar"
          disabled={!item}
          onClick={() => {
            if (!item) return
            publishToAqua({
              type: 'aqua-hub:publish',
              title: item.name,
              preview: `${tool.label}: ${item.name}`,
              source: item.kind
            })
          }}
        >
          Publicar
        </button>
      </div>
      <div className="vruler glass" aria-label="Ferramentas">
        {rulerBar}
      </div>
      <div className="hruler glass" aria-label="Ferramentas">
        {rulerBar}
      </div>
      <div className="board-slot">
        <div className={`board ratio-${tool.ratio}`} style={zoom === 100 ? undefined : { transform: `scale(${zoom / 100})` }}>
          {!ghost && item && Panel ? (
            <div className="board-editor">
              <Suspense fallback={<p className="note">Carregando editor…</p>}>
                <Panel key={item.id} itemId={item.id} />
              </Suspense>
            </div>
          ) : item ? (
            <div className="board-editor" />
          ) : (
            <button type="button" className="cbtn empty-board" disabled={!tool.kind || busy} onClick={() => void start()}>
              <strong>{tool.empty}</strong>
              <span>{tool.emptyMeta}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ModeButton({ scheme, onToggle }: { scheme: Scheme; onToggle: () => void }) {
  const night = scheme === 'night'
  return (
    <button type="button" className="cbtn mode-btn" aria-label={night ? 'Ativar modo claro' : 'Ativar modo noturno'} onClick={onToggle}>
      {night ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function Dock({
  route,
  onHome,
  onSearch,
  onCreate,
  onAi
}: {
  route: Route
  onHome: () => void
  onSearch: () => void
  onCreate: () => void
  onAi: () => void
}) {
  const workspace = route.name === 'workspace'
  return (
    <nav className="dock glass" aria-label="Atalhos">
      <button type="button" className="cbtn dock-item" aria-label="Início" aria-current={workspace ? undefined : 'page'} onClick={onHome}>
        <HomeIcon />
        {!workspace && <i className="dock-dot" />}
      </button>
      <button type="button" className="cbtn dock-item" aria-label="Buscar" onClick={onSearch}>
        <SearchIcon />
      </button>
      <button type="button" className="cbtn dock-item dock-eye" aria-label={workspace ? 'Voltar ao lançador' : 'Criar'} aria-current={workspace ? 'page' : undefined} onClick={onCreate}>
        <CreateEyeOnDisc size={30} />
        {workspace && <i className="dock-dot" />}
      </button>
      <button type="button" className="cbtn dock-item" aria-label="Criar com IA" onClick={onAi}>
        <Star4 size={22} />
      </button>
      <a className="dock-item" href={PROFILE_HREF} aria-label="Perfil">
        <ProfileIcon />
      </a>
    </nav>
  )
}

function Search({
  items,
  onClose,
  onTool,
  onItem
}: {
  items: ProjectItem[]
  onClose: () => void
  onTool: (id: ToolId) => void
  onItem: (item: ProjectItem) => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLocaleLowerCase('pt-BR')
  const tools = TOOLS.filter((tool) => !query || `${tool.label} ${tool.description} ${tool.ai}`.toLocaleLowerCase('pt-BR').includes(query))
  const recents = items.filter((item) => !query || item.name.toLocaleLowerCase('pt-BR').includes(query))
  return (
    <div className="search" role="dialog" aria-modal="true" aria-label="Buscar">
      <button type="button" className="search-back" aria-label="Fechar busca" onClick={onClose} />
      <div className="search-card glass">
        <input autoFocus placeholder="Buscar ferramentas e recentes" aria-label="Buscar" value={q} onChange={(event) => setQ(event.target.value)} />
        {tools.map((tool) => (
          <button key={tool.id} type="button" className="cbtn search-hit" onClick={() => onTool(tool.id)}>
            <ToolMark id={tool.id} />
            <span>{tool.label}</span>
          </button>
        ))}
        {recents.map((item) => {
          const tool = toolForKind(item.kind)
          if (!tool) return null
          return (
            <button key={item.id} type="button" className="cbtn search-hit" onClick={() => onItem(item)}>
              <span>{item.name}</span>
              <small className="quiet">{tool.label}</small>
            </button>
          )
        })}
        {tools.length === 0 && recents.length === 0 && <p className="quiet">Nada com esse nome.</p>}
      </div>
    </div>
  )
}
