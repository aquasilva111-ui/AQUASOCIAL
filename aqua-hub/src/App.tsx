import { MathStudioLauncher } from './MathStudioLauncher'
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { exportProjectBackup, importProjectBackup, type ItemKind } from 'aqua-project/src/index'
import type { DesignFormatId } from 'aqua-design-core/src/brand/tokens'
import { publishToAqua } from 'aqua-runtime/src/publish'

import { KIND_LABEL, onProjectChange, runtime, collabActive, store } from './hub'

const Doc = lazy(() => import('./panels/DocPanel'))
const Design = lazy(() => import('./panels/DesignPanel'))
const Slides = lazy(() => import('./panels/PresentationPanel'))
const Chart = lazy(() => import('./panels/ChartPanel'))
const Music = lazy(() => import('./panels/MusicPanel'))
const Audio = lazy(() => import('./panels/AudioPanel'))
const Mix = lazy(() => import('./panels/MixPanel'))
const Video = lazy(() => import('./panels/VideoPanel'))
const Sheet = lazy(() => import('./panels/SheetPanel'))

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

type ToolFilter = 'all' | ItemKind

/** Clean SVG vectors for every tool and action — strictly no emojis. */
export function VectorIcon({
  name,
  size = 16,
  color = 'currentColor',
  className = ''
}: {
  name: string
  size?: number
  color?: string
  className?: string
}) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className
  }

  switch (name) {
    case 'doc':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      )
    case 'design':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 10 10c0 2.5-1.5 4-3.5 4h-2a2 2 0 0 0-2 2c0 .8.4 1.5.4 2a2 2 0 0 1-2 2" />
          <circle cx="8" cy="10" r="1.2" fill={color} />
          <circle cx="12" cy="7" r="1.2" fill={color} />
          <circle cx="16" cy="10" r="1.2" fill={color} />
        </svg>
      )
    case 'presentation':
      return (
        <svg {...props}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )
    case 'sheet':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      )
    case 'music':
      return (
        <svg {...props}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )
    case 'audio':
      return (
        <svg {...props}>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
      )
    case 'mix':
      return (
        <svg {...props}>
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      )
    case 'video':
      return (
        <svg {...props}>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      )
    case 'chart':
      return (
        <svg {...props}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
          <line x1="2" y1="20" x2="22" y2="20" />
        </svg>
      )
    case 'grip':
      return (
        <svg {...props} stroke="none" fill={color}>
          <circle cx="9" cy="5" r="1.6" />
          <circle cx="15" cy="5" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="19" r="1.6" />
          <circle cx="15" cy="19" r="1.6" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg {...props}>
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
      )
    case 'layout':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="9" x2="9" y2="21" />
        </svg>
      )
    case 'tag':
      return (
        <svg {...props}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      )
    case 'folder':
      return (
        <svg {...props}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      )
    case 'edit':
      return (
        <svg {...props}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      )
    case 'list':
      return (
        <svg {...props}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      )
    case 'grid':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      )
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      )
    case 'download':
      return (
        <svg {...props}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )
    case 'upload':
      return (
        <svg {...props}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )
    case 'close':
      return (
        <svg {...props}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...props}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      )
    case 'check':
      return (
        <svg {...props}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )
    case 'clock':
    case 'history':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...props}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      )
  }
}

interface TemplateDef {
  id: string
  title: string
  kind: ItemKind
  description: string
  iconName: string
  badgeColor: string
}

const TEMPLATES: TemplateDef[] = [
  {
    id: 'tpl-meeting',
    title: 'Documento de Reunião',
    kind: 'doc',
    description: 'Pauta estruturada, participantes, decisões e próximos passos',
    iconName: 'doc',
    badgeColor: '#002bef'
  },
  {
    id: 'tpl-social',
    title: 'Post de Rede Social',
    kind: 'design',
    description: 'Design quadrado 1080x1080 pronto para publicações do AQUA',
    iconName: 'design',
    badgeColor: '#f04c24'
  },
  {
    id: 'tpl-pitch',
    title: 'Slide de Pitch Deck',
    kind: 'presentation',
    description: 'Apresentação com problema, solução, tração e equipe',
    iconName: 'presentation',
    badgeColor: '#7a39e0'
  },
  {
    id: 'tpl-beat',
    title: 'Batida no Melody Lab',
    kind: 'music',
    description: 'Sintetizador e progressão melódica para produção rápida',
    iconName: 'music',
    badgeColor: '#ff5a36'
  },
  {
    id: 'tpl-budget',
    title: 'Orçamento em Planilha',
    kind: 'sheet',
    description: 'Tabela de planejamento financeiro, receitas e despesas',
    iconName: 'sheet',
    badgeColor: '#0a9e6e'
  },
  {
    id: 'tpl-chart',
    title: 'Gráfico de Tendências',
    kind: 'chart',
    description: 'Visualização interativa de métricas e evolução temporal',
    iconName: 'chart',
    badgeColor: '#0084ff'
  }
]

interface PresetFormatDef {
  id: DesignFormatId
  title: string
  kind: ItemKind
  width: number
  height: number
  aspectRatio: string
  description: string
  category: string
  shapeType: 'square' | 'story' | 'banner' | 'slide' | 'a4'
}

const PRESET_FORMATS: PresetFormatDef[] = [
  {
    id: 'post',
    title: 'Post Social Quadrado',
    kind: 'design',
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    description: '1080 × 1080 px · Padrão perfeito para feeds e posts',
    category: 'Redes Sociais',
    shapeType: 'square'
  },
  {
    id: 'story',
    title: 'Story / Reels',
    kind: 'design',
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    description: '1080 × 1920 px · Formato vertical para Stories e vídeos curtos',
    category: 'Redes Sociais',
    shapeType: 'story'
  },
  {
    id: 'banner_profile',
    title: 'Banner / Capa de Perfil',
    kind: 'design',
    width: 1200,
    height: 630,
    aspectRatio: '1.91:1',
    description: '1200 × 630 px · Cabeçalho panorâmico e cards de redes',
    category: 'Marketing',
    shapeType: 'banner'
  },
  {
    id: 'presentation',
    title: 'Apresentação Slide',
    kind: 'presentation',
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    description: '1920 × 1080 px · Slides widescreen Full HD de alto impacto',
    category: 'Pitch',
    shapeType: 'slide'
  },
  {
    id: 'a4',
    title: 'Documento / Papel A4',
    kind: 'design',
    width: 1240,
    height: 1754,
    aspectRatio: 'A4',
    description: '1240 × 1754 px · Relatórios e flyers prontos para impressão',
    category: 'Docs',
    shapeType: 'a4'
  }
]

const SYSTEM_CATEGORIES = ['Marketing', 'Redes Sociais', 'Pitch', 'Docs', 'Financeiro', 'Música', 'Geral']

export function App() {
  const project = useSyncExternalStore(onProjectChange, () => runtime.project)
  const [current, setCurrent] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('aqua:search_history')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === 'string' && t.trim()).slice(0, 5)
      }
    } catch {
      // fallback
    }
    return []
  })
  const [activeFilter, setActiveFilter] = useState<ToolFilter>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)
  const [showPresetsModal, setShowPresetsModal] = useState(false)
  const [showCategorySelector, setShowCategorySelector] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [backupError, setBackupError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addToSearchHistory = (term: string) => {
    const clean = term.trim()
    if (!clean) return
    setSearchHistory((prev) => {
      const filtered = prev.filter((t) => t.toLowerCase() !== clean.toLowerCase())
      const updated = [clean, ...filtered].slice(0, 5)
      try {
        localStorage.setItem('aqua:search_history', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return updated
    })
  }

  const removeSearchHistoryItem = (termToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSearchHistory((prev) => {
      const updated = prev.filter((t) => t !== termToRemove)
      try {
        localStorage.setItem('aqua:search_history', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return updated
    })
  }

  const clearSearchHistory = () => {
    setSearchHistory([])
    try {
      localStorage.removeItem('aqua:search_history')
    } catch {
      // ignore
    }
  }

  const item = project.items.find((i) => i.id === current)

  // Extrair todas as categorias existentes no projeto
  const allProjectCategories = Array.from(
    new Set([
      ...SYSTEM_CATEGORIES,
      ...(project.category ? [project.category] : []),
      ...project.items.map((it) => it.category).filter(Boolean) as string[]
    ])
  )

  const filteredItems = project.items.filter((i) => {
    const matchesSearch =
      (i.name || '').toLowerCase().includes(search.toLowerCase().trim()) ||
      (i.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase().trim())) ||
      (i.category || '').toLowerCase().includes(search.toLowerCase().trim())
    const matchesKind = activeFilter === 'all' || i.kind === activeFilter
    const matchesCategory =
      selectedCategory === 'all' || (i.category || 'Geral').toLowerCase() === selectedCategory.toLowerCase()
    return matchesSearch && matchesKind && matchesCategory
  })

  // Contagem por categoria para as tags/pills
  const kindCounts = project.items.reduce<Record<string, number>>((acc, it) => {
    acc[it.kind] = (acc[it.kind] || 0) + 1
    return acc
  }, {})

  useEffect(() => {
    const flush = () => void runtime.flush()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  const notifySaving = () => {
    setSaveStatus('saving')
    setTimeout(() => setSaveStatus('saved'), 700)
  }

  const create = async (kind: ItemKind, customName?: string, opts?: { format?: string; category?: string; tags?: string[] }) => {
    notifySaving()
    const count = project.items.filter((i) => i.kind === kind).length + 1
    const name = customName ?? `${KIND_LABEL[kind]} ${count}`
    const it = await runtime.create(kind, name, opts)
    setCurrent(it.id)
    setShowTemplatesModal(false)
    setShowPresetsModal(false)
  }

  const createFromTemplate = async (tpl: TemplateDef) => {
    await create(tpl.kind, tpl.title)
  }

  const createFromPreset = async (preset: PresetFormatDef) => {
    const count = project.items.filter((i) => i.kind === preset.kind).length + 1
    await create(preset.kind, `${preset.title} ${count}`, {
      format: preset.id,
      category: preset.category,
      tags: [preset.aspectRatio, preset.category]
    })
  }

  const changeItemCategory = (cat: string) => {
    if (!item) return
    notifySaving()
    runtime.setItemCategory(item.id, cat)
    setShowCategorySelector(false)
  }

  const addTagToItem = () => {
    if (!item || !newTagInput.trim()) return
    const tag = newTagInput.trim()
    const currentTags = item.tags || []
    if (!currentTags.includes(tag)) {
      notifySaving()
      runtime.setItemTags(item.id, [...currentTags, tag])
    }
    setNewTagInput('')
  }

  const removeTagFromItem = (tagToRemove: string) => {
    if (!item || !item.tags) return
    notifySaving()
    runtime.setItemTags(item.id, item.tags.filter((t) => t !== tagToRemove))
  }

  const changeProjectCategoryPrompt = () => {
    const newCat = prompt('Informe a categoria geral deste projeto:', project.category || 'Marketing')
    if (newCat && newCat.trim()) {
      notifySaving()
      runtime.setProjectCategory(newCat.trim())
    }
  }

  const onPublish = () => {
    if (!item) return
    publishToAqua({
      type: 'aqua-hub:publish',
      title: item.name,
      preview: `${KIND_LABEL[item.kind] ?? item.kind}: ${item.name}`,
      source: item.kind
    })
  }

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverItemId !== id) {
      setDragOverItemId(id)
    }
  }

  const handleDragLeave = (_e: React.DragEvent, id: string) => {
    if (dragOverItemId === id) {
      setDragOverItemId(null)
    }
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedItemId || draggedItemId === targetId) {
      setDraggedItemId(null)
      setDragOverItemId(null)
      return
    }

    const targetIndex = project.items.findIndex((it) => it.id === targetId)
    if (targetIndex >= 0) {
      notifySaving()
      runtime.move(draggedItemId, targetIndex)
    }

    setDraggedItemId(null)
    setDragOverItemId(null)
  }

  const handleDragEnd = () => {
    setDraggedItemId(null)
    setDragOverItemId(null)
  }

  const exportBackup = async () => {
    setBackupError('')
    try {
      await runtime.flush()
      const backupData = await exportProjectBackup(runtime.project, store)
      const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aqua-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Não foi possível gerar o backup.')
    }
  }

  const triggerImport = () => fileInputRef.current?.click()

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBackupError('')
    try {
      if (collabActive) throw new Error('Abra o Create sem uma sala de colaboração para restaurar um backup.')
      if (!confirm('Restaurar este backup? O projeto atual será substituído. Exporte um backup dele antes de continuar.')) return
      const imported = await importProjectBackup(JSON.parse(await file.text()), store)
      setCurrent(null)
      await runtime.replaceProject(imported)
      setCurrent(imported.items[0]?.id ?? null)
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Não foi possível restaurar o backup.')
    }
  }

  const Panel = item && PANELS[item.kind]

  const toolCategories: { id: ToolFilter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'doc', label: 'Docs' },
    { id: 'design', label: 'Design' },
    { id: 'presentation', label: 'Slides' },
    { id: 'sheet', label: 'Planilhas' },
    { id: 'music', label: 'Música' },
    { id: 'audio', label: 'Áudio' },
    { id: 'mix', label: 'Mix' },
    { id: 'video', label: 'Vídeo' },
    { id: 'chart', label: 'Gráficos' }
  ]

  return (
    <div className="app">
      <aside className="side">
        <div className="side-header">
          <div className="project-title-meta">
            <h1>AQUA Create · {project.name}</h1>
            <div className="project-category-badge" onClick={changeProjectCategoryPrompt} title="Clique para editar a categoria do projeto">
              <VectorIcon name="folder" size={12} color="var(--blue)" />
              <span>{project.category || 'Categoria: Geral'}</span>
              <VectorIcon name="edit" size={10} color="var(--muted)" />
            </div>
          </div>
          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Visualização em Lista"
              type="button"
            >
              <VectorIcon name="list" size={14} />
            </button>
            <button
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Visualização em Grade com Miniaturas"
              type="button"
            >
              <VectorIcon name="grid" size={14} />
            </button>
          </div>
        </div>

        {collabActive && <p className="note" style={{ color: '#002bef', fontWeight: 600 }}>Colaboração ativa</p>}

        {/* Barra de pesquisa em tempo real com vetor SVG */}
        <div className="search-wrap">
          <span className="search-icon-vector">
            <VectorIcon name="search" size={14} color="var(--muted)" />
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por título, tag ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')} title="Limpar busca" type="button">
              <VectorIcon name="close" size={12} />
            </button>
          )}
        </div>

        {/* Filtro por Categoria Organizacional */}
        <div className="category-filter-select-wrap">
          <span className="category-select-icon">
            <VectorIcon name="tag" size={13} color="var(--muted)" />
          </span>
          <select
            className="category-filter-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">Todas as Categorias</option>
            {allProjectCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro rápido por tipo de ferramenta (Tags/Pills) */}
        <div className="filter-pills-bar">
          {toolCategories.map((cat) => {
            const count = cat.id === 'all' ? project.items.length : (kindCounts[cat.id] || 0)
            return (
              <button
                key={cat.id}
                type="button"
                className={`filter-pill ${activeFilter === cat.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(cat.id)}
              >
                {cat.label} {count > 0 && <span className="pill-count">{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Botões de Ações Criativas Principais */}
        <div className="action-row-dual">
          <button className="btn-presets-trigger" onClick={() => setShowPresetsModal(true)} type="button">
            <VectorIcon name="layout" size={15} color="#fff" />
            <span>Formatos Rápidos</span>
          </button>
          <button className="btn-templates-trigger" onClick={() => setShowTemplatesModal(true)} type="button">
            <VectorIcon name="sparkles" size={15} color="#fff" />
            <span>Modelos</span>
          </button>
        </div>

        {/* Criadores Rápidos */}
        <div className="new">
          {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
            <button key={k} onClick={() => create(k)} type="button">
              <VectorIcon name={k} size={12} />
              <span>{KIND_LABEL[k]}</span>
            </button>
          ))}
        </div>

        <MathStudioLauncher />
        {backupError && <p role="alert" className="note">{backupError}</p>}

        {/* Lista ou Grade de Itens Reordenáveis via Drag and Drop */}
        <div className="items-container">
          {viewMode === 'list' ? (
            <div className="items-list">
              {filteredItems.map((i) => {
                const isDragging = draggedItemId === i.id
                const isOver = dragOverItemId === i.id
                return (
                  <div
                    key={i.id}
                    className={`item-draggable-wrap ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, i.id)}
                    onDragOver={(e) => handleDragOver(e, i.id)}
                    onDragLeave={(e) => handleDragLeave(e, i.id)}
                    onDrop={(e) => handleDrop(e, i.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <button
                      type="button"
                      className={'item' + (i.id === current ? ' on' : '')}
                      onClick={() => setCurrent(i.id)}
                    >
                      <div className="item-row">
                        <span className="drag-handle" title="Arraste para reordenar">
                          <VectorIcon name="grip" size={14} color="var(--muted)" />
                        </span>
                        <span className="item-icon-vector">
                          <VectorIcon name={i.kind} size={15} color="var(--blue)" />
                        </span>
                        <div className="item-text">
                          <span className="item-title">{i.name}</span>
                          <div className="item-meta-line">
                            <span className="item-cat-tag">{i.category || 'Geral'}</span>
                            <small>· {new Date(i.updatedAt).toLocaleDateString()}</small>
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="items-grid">
              {filteredItems.map((i) => {
                const isDragging = draggedItemId === i.id
                const isOver = dragOverItemId === i.id
                return (
                  <div
                    key={i.id}
                    className={`grid-card ${i.id === current ? 'on' : ''} ${isDragging ? 'dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, i.id)}
                    onDragOver={(e) => handleDragOver(e, i.id)}
                    onDragLeave={(e) => handleDragLeave(e, i.id)}
                    onDrop={(e) => handleDrop(e, i.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setCurrent(i.id)}
                  >
                    <div className={`card-thumbnail thumb-${i.kind}`}>
                      <span className="drag-handle-grid" title="Arraste para reordenar">
                        <VectorIcon name="grip" size={13} color="rgba(0,0,0,0.4)" />
                      </span>
                      <VectorIcon name={i.kind} size={24} />
                      <span className="thumb-watermark">{KIND_LABEL[i.kind] ?? i.kind}</span>
                    </div>
                    <div className="card-info">
                      <span className="card-title">{i.name}</span>
                      <div className="card-category-row">
                        <span className="card-cat-pill">{i.category || 'Geral'}</span>
                        <small>{new Date(i.updatedAt).toLocaleDateString()}</small>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {project.items.length > 0 && filteredItems.length === 0 && (
            <p className="note">Nenhum item corresponde à busca ou filtro atual.</p>
          )}

          {!project.items.length && (
            <p className="note">Crie o primeiro item acima ou use um formato rápido.</p>
          )}
        </div>

        {/* Rodapé da Sidebar: Backup & Restauração com ícones vetoriais */}
        <div className="side-footer">
          <button className="footer-btn" onClick={exportBackup} title="Exportar projeto em arquivo JSON" type="button">
            <VectorIcon name="download" size={13} />
            <span>Backup</span>
          </button>
          <button className="footer-btn" onClick={triggerImport} title="Restaurar backup do projeto" type="button">
            <VectorIcon name="upload" size={13} />
            <span>Importar</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".json"
            onChange={handleImportFile}
          />
        </div>
      </aside>

      <main className="main">
        {item && Panel ? (
          <>
            <div className="bar">
              <div className="bar-title-section">
                <span className="item-title-icon">
                  <VectorIcon name={item.kind} size={18} color="var(--blue)" />
                </span>
                <h2>{item.name}</h2>
                <span className="item-badge">{KIND_LABEL[item.kind] ?? item.kind}</span>

                {/* Badge de Categoria Clicável */}
                <div className="item-category-manager">
                  <button
                    type="button"
                    className="item-category-trigger-btn"
                    onClick={() => setShowCategorySelector(!showCategorySelector)}
                    title="Alterar categoria deste item"
                  >
                    <VectorIcon name="tag" size={12} color="var(--muted)" />
                    <span>{item.category || 'Geral'}</span>
                    <VectorIcon name="edit" size={10} color="var(--muted)" />
                  </button>

                  {showCategorySelector && (
                    <div className="category-dropdown-popover">
                      <div className="popover-header">
                        <span>Escolher Categoria</span>
                        <button type="button" onClick={() => setShowCategorySelector(false)}>
                          <VectorIcon name="close" size={12} />
                        </button>
                      </div>
                      <div className="popover-options">
                        {allProjectCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            className={`popover-option ${item.category === cat ? 'active' : ''}`}
                            onClick={() => changeItemCategory(cat)}
                          >
                            <span>{cat}</span>
                            {item.category === cat && <VectorIcon name="check" size={12} />}
                          </button>
                        ))}
                      </div>
                      <div className="popover-custom-create">
                        <input
                          type="text"
                          placeholder="Nova categoria..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              changeItemCategory(e.currentTarget.value.trim())
                              e.currentTarget.value = ''
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lista e Adição de Tags Rápidas */}
              <div className="item-tags-bar">
                {(item.tags || []).map((t) => (
                  <span key={t} className="item-tag-chip">
                    {t}
                    <button type="button" onClick={() => removeTagFromItem(t)} title="Remover tag">
                      ×
                    </button>
                  </span>
                ))}
                <div className="add-tag-input-wrap">
                  <input
                    type="text"
                    className="add-tag-input"
                    placeholder="+ Tag (Enter)"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTagToItem()
                      }
                    }}
                  />
                </div>
              </div>

              {/* Indicador visual de salvamento e status */}
              <div className="autosave-status" title="Seu trabalho é salvo continuamente no navegador">
                <span className={`status-dot ${saveStatus}`} />
                <span className="status-text">
                  {saveStatus === 'saving' ? 'Salvando...' : 'Salvo no navegador'}
                </span>
              </div>

              <div className="bar-actions">
                <button onClick={onPublish} className="primary" type="button">
                  Publicar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const name = prompt('Novo nome', item.name)
                    if (name && name.trim()) {
                      notifySaving()
                      runtime.rename(item.id, name.trim())
                    }
                  }}
                >
                  Renomear
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Apagar "${item.name}"?`)) {
                      notifySaving()
                      await runtime.remove(item.id)
                      setCurrent(null)
                    }
                  }}
                >
                  Apagar
                </button>
              </div>
            </div>
            <div className="body">
              <Suspense fallback={<p className="note">Carregando editor…</p>}>
                <Panel key={item.id} itemId={item.id} />
              </Suspense>
            </div>
          </>
        ) : (
          <div className="dashboard-empty">
            <div className="dashboard-hero">
              <h2>Bem-vindo ao AQUA Create</h2>
              <p>Escolha um formato rápido, crie a partir de um modelo ou abra um item na barra lateral:</p>
            </div>

            {/* Showcase de Formatos Predefinidos (Presets Rápidos) */}
            <div className="presets-showcase">
              <div className="section-title-row">
                <VectorIcon name="layout" size={18} color="var(--blue)" />
                <h3>Formatos e Dimensões Rápidas (Presets Canva / Adobe)</h3>
              </div>
              <div className="presets-grid-showcase">
                {PRESET_FORMATS.map((preset) => (
                  <div
                    key={preset.id}
                    className="preset-showcase-card"
                    onClick={() => createFromPreset(preset)}
                  >
                    <div className="preset-card-visual">
                      <div className={`preset-mockup-frame frame-${preset.shapeType}`}>
                        <span>{preset.aspectRatio}</span>
                      </div>
                    </div>
                    <div className="preset-card-details">
                      <strong>{preset.title}</strong>
                      <span className="preset-dims">{preset.width} × {preset.height} px</span>
                      <small>{preset.description}</small>
                      <span className="preset-category-pill">{preset.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Showcase de Modelos Prontos */}
            <div className="templates-showcase">
              <div className="section-title-row">
                <VectorIcon name="sparkles" size={18} color="#f04c24" />
                <h3>Modelos Prontos (AQUA Templates)</h3>
              </div>
              <div className="templates-grid">
                {TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="template-card"
                    onClick={() => createFromTemplate(tpl)}
                  >
                    <div className="tpl-icon" style={{ borderColor: tpl.badgeColor, color: tpl.badgeColor }}>
                      <VectorIcon name={tpl.iconName} size={22} color={tpl.badgeColor} />
                    </div>
                    <div className="tpl-info">
                      <h4>{tpl.title}</h4>
                      <p>{tpl.description}</p>
                      <span className="tpl-badge" style={{ backgroundColor: tpl.badgeColor }}>
                        {KIND_LABEL[tpl.kind]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {project.items.length > 0 && (
              <div className="recent-items-showcase">
                <h3>Itens Recentes do Projeto</h3>
                <div className="recent-grid">
                  {project.items.slice(0, 6).map((it) => (
                    <div
                      key={it.id}
                      className="recent-card"
                      onClick={() => setCurrent(it.id)}
                    >
                      <div className={`card-thumbnail thumb-${it.kind}`}>
                        <VectorIcon name={it.kind} size={28} />
                      </div>
                      <div className="recent-details">
                        <strong>{it.name}</strong>
                        <div className="recent-meta">
                          <span className="recent-category">{it.category || 'Geral'}</span>
                          <small>{new Date(it.updatedAt).toLocaleDateString()}</small>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de Formatos Rápidos (Presets) */}
      {showPresetsModal && (
        <div className="modal-backdrop" onClick={() => setShowPresetsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <VectorIcon name="layout" size={18} color="var(--blue)" />
                <h3>Tamanhos e Formatos Predefinidos (Presets Rápidos)</h3>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowPresetsModal(false)}
                type="button"
                aria-label="Fechar"
              >
                <VectorIcon name="close" size={16} />
              </button>
            </div>
            <p className="modal-subtitle">
              Escolha a dimensão ideal para começar com proporções precisas:
            </p>
            <div className="modal-presets-list">
              {PRESET_FORMATS.map((preset) => (
                <div
                  key={preset.id}
                  className="modal-preset-item"
                  onClick={() => createFromPreset(preset)}
                >
                  <div className={`preset-item-aspect-box frame-${preset.shapeType}`}>
                    <span>{preset.aspectRatio}</span>
                  </div>
                  <div className="preset-item-details">
                    <strong>{preset.title}</strong>
                    <span className="preset-dim-label">{preset.width} × {preset.height} px</span>
                    <p>{preset.description}</p>
                  </div>
                  <span className="preset-item-badge">
                    {preset.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Modelos Prontos */}
      {showTemplatesModal && (
        <div className="modal-backdrop" onClick={() => setShowTemplatesModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <VectorIcon name="sparkles" size={18} color="var(--blue)" />
                <h3>Modelos Prontos (AQUA Templates)</h3>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowTemplatesModal(false)}
                type="button"
                aria-label="Fechar"
              >
                <VectorIcon name="close" size={16} />
              </button>
            </div>
            <p className="modal-subtitle">
              Selecione um modelo para iniciar imediatamente com estrutura configurada:
            </p>
            <div className="modal-templates-list">
              {TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  className="modal-template-item"
                  onClick={() => createFromTemplate(tpl)}
                >
                  <div className="tpl-icon-box" style={{ backgroundColor: `${tpl.badgeColor}15`, color: tpl.badgeColor }}>
                    <VectorIcon name={tpl.iconName} size={22} color={tpl.badgeColor} />
                  </div>
                  <div className="tpl-item-details">
                    <strong>{tpl.title}</strong>
                    <p>{tpl.description}</p>
                  </div>
                  <span className="tpl-item-tag" style={{ backgroundColor: tpl.badgeColor }}>
                    {KIND_LABEL[tpl.kind]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
