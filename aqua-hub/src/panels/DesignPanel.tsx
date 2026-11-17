import { useEffect, useRef, useState } from 'react'

import { AQUA_BRAND_KIT } from 'aqua-design-core/src/brand/kit'
import { hexToColor, solid } from 'aqua-design-core/src/brand/document'
import { AQUA } from 'aqua-design-core/src/brand/tokens'
import { FabricRenderer } from 'aqua-design-core/src/fabric/renderer'
import type { DesignSession } from 'aqua-runtime/src/adapters/design'

import { download, runtime, store } from '../hub'
import { UndoRedo, useSession } from './hooks'

interface UploadedMedia {
  id: string
  name: string
  url: string
  mime: string
  date?: number
}

interface StoredUploadMeta {
  hash: string
  name: string
  mime: string
  date: number
}

const STORAGE_UPLOADS_KEY = 'aqua_shared_uploads_registry'

type DesignToolTab = 'shapes' | 'text' | 'brand' | 'uploads'
type ColorApplyTarget = 'fill' | 'stroke'

/** Clean vector icons for design tools (zero emojis) */
function ToolIcon({ name, size = 16, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }

  switch (name) {
    case 'shapes':
      return (
        <svg {...props}>
          <circle cx="9" cy="9" r="6" />
          <rect x="11" y="11" width="10" height="10" rx="2" />
        </svg>
      )
    case 'text':
      return (
        <svg {...props}>
          <polyline points="4 7 4 4 20 4 20 7" />
          <line x1="9" y1="20" x2="15" y2="20" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      )
    case 'brand':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 10 10c0 2.5-1.5 4-3.5 4h-2a2 2 0 0 0-2 2c0 .8.4 1.5.4 2a2 2 0 0 1-2 2" />
          <circle cx="8" cy="10" r="1.2" fill={color} />
          <circle cx="12" cy="7" r="1.2" fill={color} />
          <circle cx="16" cy="10" r="1.2" fill={color} />
        </svg>
      )
    case 'uploads':
      return (
        <svg {...props}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )
    case 'rect':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="1" />
        </svg>
      )
    case 'rounded-rect':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
        </svg>
      )
    case 'circle':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      )
    case 'arrow':
      return (
        <svg {...props}>
          <line x1="4" y1="12" x2="18" y2="12" />
          <polyline points="12 6 18 12 12 18" />
        </svg>
      )
    case 'star':
      return (
        <svg {...props}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      )
    case 'triangle':
      return (
        <svg {...props}>
          <polygon points="12 3 22 21 2 21 12 3" />
        </svg>
      )
    case 'line':
      return (
        <svg {...props}>
          <line x1="3" y1="12" x2="21" y2="12" strokeWidth={3} />
        </svg>
      )
    case 'dashed-line':
      return (
        <svg {...props}>
          <line x1="3" y1="12" x2="7" y2="12" strokeWidth={3} />
          <line x1="10" y1="12" x2="14" y2="12" strokeWidth={3} />
          <line x1="17" y1="12" x2="21" y2="12" strokeWidth={3} />
        </svg>
      )
    case 'dotted-line':
      return (
        <svg {...props}>
          <circle cx="4" cy="12" r="1.5" fill={color} />
          <circle cx="9.3" cy="12" r="1.5" fill={color} />
          <circle cx="14.6" cy="12" r="1.5" fill={color} />
          <circle cx="20" cy="12" r="1.5" fill={color} />
        </svg>
      )
    case 'drag':
      return (
        <svg {...props} stroke="none" fill={color}>
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...props}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      )
    case 'zoom':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
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
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="6" />
        </svg>
      )
  }
}

/** Paleta Oficial Nazar e tons corporativos do AQUA */
const NAZAR_PALETTE = [
  '#002BEF', // Azul Nazar Original
  '#009EFF', // Aqua Sky
  '#F04C24', // Laranja Vivo
  '#7EC8F5', // Azul Glacial
  '#0A9E6E', // Verde Esmeralda
  '#FF5A36', // Coral
  '#FACC15', // Dourado Solar
  '#0F172A', // Tinta Escura
  '#475569', // Ardósia Média
  '#EFF2F6', // Superfície Neutra
  '#FFFFFF'  // Branco Puro
]

type ShapeKind =
  | 'RECTANGLE'
  | 'ROUNDED_RECTANGLE'
  | 'ELLIPSE'
  | 'ARROW'
  | 'STAR'
  | 'POLYGON'
  | 'LINE'
  | 'DASHED_LINE'
  | 'DOTTED_LINE'

type TextVariant =
  | 'trio'
  | 'headline'
  | 'subhead'
  | 'body'
  | 'quote'
  | 'badge'

interface DragTransferData {
  aquaKind: 'shape' | 'text' | 'upload'
  shapeType?: ShapeKind
  textVariant?: TextVariant
  uploadId?: string
  uploadUrl?: string
}

/** Design and Presentations edit the same graph; `slideId` frames which artboard is in view. */
export function Editor({ itemId, slideId, children }: { itemId: string; slideId?: string; children?: React.ReactNode }) {
  const { session, refresh } = useSession<DesignSession>(itemId)
  const host = useRef<HTMLDivElement>(null)
  const renderer = useRef<FabricRenderer | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<DesignToolTab>('shapes')
  const [colorTarget, setColorTarget] = useState<ColorApplyTarget>('fill')
  const [customBrandColors, setCustomBrandColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('aqua_custom_palette')
      return saved ? JSON.parse(saved) : ['#6366f1', '#ec4899', '#f59e0b', '#10b981']
    } catch {
      return ['#6366f1', '#ec4899', '#f59e0b', '#10b981']
    }
  })
  const [newColor, setNewColor] = useState('#6366f1')
  const [uploads, setUploads] = useState<UploadedMedia[]>([])
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const frames = () => (session ? session.graph.getChildren(session.graph.getPages()[0].id).filter((n) => n.type === 'FRAME') : [])
  const target = () => frames().find((f) => f.id === slideId) ?? frames()[0]

  // Carrega uploads previamente salvos no IndexedDB e registrados no Hub
  useEffect(() => {
    let cancelled = false
    const loadStoredUploads = async () => {
      try {
        const raw = localStorage.getItem(STORAGE_UPLOADS_KEY)
        if (!raw) return
        const list: StoredUploadMeta[] = JSON.parse(raw)
        const loaded: UploadedMedia[] = []
        for (const item of list) {
          const entry = await store.get(item.hash)
          if (entry) {
            const blob = new Blob([entry.bytes], { type: item.mime })
            const url = URL.createObjectURL(blob)
            loaded.push({
              id: item.hash,
              name: item.name,
              url,
              mime: item.mime,
              date: item.date
            })
          }
        }
        if (!cancelled && loaded.length > 0) {
          setUploads(loaded)
        }
      } catch (err) {
        console.warn('Falha ao carregar galeria de uploads persistida:', err)
      }
    }
    void loadStoredUploads()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const el = host.current
    if (!session || !el) return
    if (!renderer.current) {
      const c = document.createElement('canvas')
      el.appendChild(c)
      renderer.current = new FabricRenderer(session.graph, c, { interactive: true, width: 920, height: 600 })
    }
    const r = renderer.current
    r.graph = session.graph
    if (import.meta.env.DEV) (window as unknown as { __renderer?: unknown }).__renderer = r
    r.showPage(session.graph.getPages()[0].id)
    const f = target()
    if (f) r.fit(f.id)
  })

  useEffect(
    () => () => {
      renderer.current?.dispose()
      renderer.current = null
      if (host.current) host.current.innerHTML = ''
    },
    []
  )

  const showFeedback = (msg: string) => {
    setActionNotice(msg)
    setTimeout(() => setActionNotice(null), 2500)
  }

  if (!session) return <p className="note">Abrindo editor…</p>
  const f = target()

  const addShape = (type: ShapeKind, customX?: number, customY?: number) => {
    if (!f) return
    const defaultColor = AQUA_BRAND_KIT.colors[0]
    const w = f.width
    const h = f.height

    const x = customX !== undefined ? Math.max(0, Math.min(w - 60, customX)) : w * 0.2
    const y = customY !== undefined ? Math.max(0, Math.min(h - 60, customY)) : h * 0.25

    const common = {
      x,
      y,
      fills: [solid(defaultColor)]
    }

    if (type === 'ROUNDED_RECTANGLE') {
      session.graph.createNode('RECTANGLE', f.id, {
        ...common,
        name: 'Retângulo Arredondado',
        width: Math.round(w * 0.28),
        height: Math.round(w * 0.18),
        cornerRadius: 24,
        topLeftRadius: 24,
        topRightRadius: 24,
        bottomRightRadius: 24,
        bottomLeftRadius: 24
      })
    } else if (type === 'ARROW') {
      session.graph.createNode('POLYGON', f.id, {
        ...common,
        name: 'Seta Direcional',
        width: Math.round(w * 0.25),
        height: Math.round(w * 0.14),
        shapeKind: 'ARROW'
      } as unknown as { name: string; width: number; height: number })
    } else if (type === 'LINE') {
      session.graph.createNode('LINE', f.id, {
        ...common,
        name: 'Linha Divisória',
        width: Math.round(w * 0.35),
        height: 2,
        strokes: [{ color: hexToColor(AQUA.ink), weight: 3, opacity: 1, visible: true, align: 'CENTER' }]
      })
    } else if (type === 'DASHED_LINE') {
      session.graph.createNode('LINE', f.id, {
        ...common,
        name: 'Linha Tracejada',
        width: Math.round(w * 0.35),
        height: 2,
        strokes: [{ color: hexToColor(NAZAR_PALETTE[0]), weight: 3, opacity: 1, visible: true, align: 'CENTER', dashPattern: [12, 8] }]
      })
    } else if (type === 'DOTTED_LINE') {
      session.graph.createNode('LINE', f.id, {
        ...common,
        name: 'Linha Pontilhada',
        width: Math.round(w * 0.35),
        height: 2,
        strokes: [{ color: hexToColor(NAZAR_PALETTE[2]), weight: 4, opacity: 1, visible: true, align: 'CENTER', dashPattern: [3, 8], cap: 'ROUND' }]
      })
    } else if (type === 'STAR') {
      session.graph.createNode('STAR', f.id, {
        ...common,
        name: 'Estrela 5 Pontas',
        fills: [solid(NAZAR_PALETTE[2])],
        width: Math.round(w * 0.22),
        height: Math.round(w * 0.22)
      })
    } else if (type === 'POLYGON') {
      session.graph.createNode('POLYGON', f.id, {
        ...common,
        name: 'Triângulo',
        fills: [solid(NAZAR_PALETTE[4])],
        width: Math.round(w * 0.22),
        height: Math.round(w * 0.22)
      })
    } else {
      session.graph.createNode(type, f.id, {
        ...common,
        name: type === 'RECTANGLE' ? 'Retângulo' : 'Círculo',
        width: Math.round(w * 0.22),
        height: Math.round(w * 0.22)
      })
    }
    showFeedback('Forma adicionada ao design')
  }

  const addTextPreset = (variant: TextVariant, customX?: number, customY?: number) => {
    if (!f) return
    const w = f.width
    const h = f.height
    const baseX = customX !== undefined ? Math.max(0, Math.min(w - 100, customX)) : w * 0.1
    const baseY = customY !== undefined ? Math.max(0, Math.min(h - 100, customY)) : h * 0.2

    if (variant === 'trio') {
      // Conjunto completo pré-formatado: Título de Impacto + Subtítulo elegante + Texto de apoio
      session.graph.createNode('TEXT', f.id, {
        name: 'Título de Impacto',
        text: 'TÍTULO DE IMPACTO',
        x: baseX,
        y: baseY,
        width: Math.round(w * 0.8),
        height: 70,
        fontSize: Math.max(28, Math.round(w * 0.054)),
        fontFamily: AQUA_BRAND_KIT.headingFont,
        fontWeight: 800,
        fills: [solid(NAZAR_PALETTE[0])]
      })
      session.graph.createNode('TEXT', f.id, {
        name: 'Subtítulo Elegante',
        text: 'Subtítulo atraente e conciso com a proposta do projeto',
        x: baseX,
        y: baseY + Math.round(w * 0.075),
        width: Math.round(w * 0.75),
        height: 48,
        fontSize: Math.max(18, Math.round(w * 0.028)),
        fontFamily: AQUA_BRAND_KIT.headingFont,
        fontWeight: 600,
        fills: [solid(AQUA.ink)]
      })
      session.graph.createNode('TEXT', f.id, {
        name: 'Texto de Apoio',
        text: 'Descreva os detalhes da sua mensagem, narrativa ou proposta comercial com equilíbrio e legibilidade profissional.',
        x: baseX,
        y: baseY + Math.round(w * 0.13),
        width: Math.round(w * 0.7),
        height: 80,
        fontSize: Math.max(14, Math.round(w * 0.018)),
        fontFamily: AQUA_BRAND_KIT.bodyFont,
        fontWeight: 400,
        fills: [solid(AQUA.muted)]
      })
      showFeedback('Kit de Tipografia (Título + Subtítulo + Apoio) aplicado!')
    } else if (variant === 'headline') {
      session.graph.createNode('TEXT', f.id, {
        name: 'Título de Impacto',
        text: 'TÍTULO DE IMPACTO',
        x: baseX,
        y: baseY,
        width: Math.round(w * 0.8),
        height: 120,
        fontSize: Math.max(28, Math.round(w * 0.068)),
        fontFamily: AQUA_BRAND_KIT.headingFont,
        fontWeight: 800,
        fills: [solid(AQUA.ink)]
      })
      showFeedback('Título de Impacto inserido')
    } else if (variant === 'subhead') {
      session.graph.createNode('TEXT', f.id, {
        name: 'Subtítulo Elegante',
        text: 'Subtítulo detalhado com proposta de valor clara',
        x: baseX,
        y: baseY,
        width: Math.round(w * 0.75),
        height: 70,
        fontSize: Math.max(18, Math.round(w * 0.036)),
        fontFamily: AQUA_BRAND_KIT.headingFont,
        fontWeight: 600,
        fills: [solid(AQUA.muted)]
      })
      showFeedback('Subtítulo Elegante inserido')
    } else if (variant === 'body') {
      session.graph.createNode('TEXT', f.id, {
        name: 'Texto de Apoio',
        text: 'Insira aqui seu parágrafo explicativo. Este bloco de texto pode conter múltiplos detalhes sobre a sua ideia, produto ou narrativa.',
        x: baseX,
        y: baseY,
        width: Math.round(w * 0.65),
        height: 110,
        fontSize: Math.max(14, Math.round(w * 0.022)),
        fontFamily: AQUA_BRAND_KIT.bodyFont,
        fontWeight: 400,
        fills: [solid(AQUA.ink)]
      })
      showFeedback('Texto de Apoio inserido')
    } else if (variant === 'quote') {
      // Citação em destaque com barra decorativa
      session.graph.createNode('RECTANGLE', f.id, {
        name: 'Barra da Citação',
        x: baseX,
        y: baseY,
        width: 6,
        height: 70,
        cornerRadius: 3,
        fills: [solid(NAZAR_PALETTE[0])]
      })
      session.graph.createNode('TEXT', f.id, {
        name: 'Texto da Citação',
        text: '“Design não é apenas o que parece ou o que se sente. Design é como funciona.”',
        x: baseX + 16,
        y: baseY,
        width: Math.round(w * 0.7),
        height: 70,
        fontSize: Math.max(16, Math.round(w * 0.024)),
        fontFamily: AQUA_BRAND_KIT.headingFont,
        fontWeight: 600,
        fills: [solid(AQUA.ink)]
      })
      showFeedback('Bloco de citação inserido')
    } else if (variant === 'badge') {
      const badgeW = Math.round(w * 0.32)
      const badgeH = 44
      session.graph.createNode('RECTANGLE', f.id, {
        name: 'Fundo do Badge',
        x: baseX,
        y: baseY,
        width: badgeW,
        height: badgeH,
        cornerRadius: 22,
        fills: [solid(NAZAR_PALETTE[2])]
      })
      session.graph.createNode('TEXT', f.id, {
        name: 'Texto do Badge',
        text: 'NOVO LANÇAMENTO',
        x: baseX + 14,
        y: baseY + 12,
        width: badgeW - 28,
        height: badgeH - 12,
        fontSize: 14,
        fontFamily: AQUA_BRAND_KIT.headingFont,
        fontWeight: 700,
        fills: [solid(AQUA.white)]
      })
      showFeedback('Selo Promocional inserido')
    }
  }

  const applyColor = (hex: string) => {
    const sel = (renderer.current?.canvas as { getActiveObject?: () => { aquaNodeId?: string } | undefined })?.getActiveObject?.()
    if (sel?.aquaNodeId) {
      const node = session.graph.getNode(sel.aquaNodeId)
      if (colorTarget === 'stroke' || node?.type === 'LINE') {
        session.graph.updateNode(sel.aquaNodeId, {
          strokes: [{ color: hexToColor(hex), weight: 3, opacity: 1, visible: true, align: 'CENTER' }]
        })
        showFeedback(`Contorno alterado para ${hex}`)
      } else {
        session.graph.updateNode(sel.aquaNodeId, {
          fills: [{ ...solid(hex), color: hexToColor(hex) }]
        })
        showFeedback(`Preenchimento alterado para ${hex}`)
      }
    } else if (f) {
      session.graph.updateNode(f.id, { fills: [{ ...solid(hex), color: hexToColor(hex) }] })
      showFeedback(`Fundo do artboard alterado para ${hex}`)
    }
  }

  const saveCustomColor = () => {
    if (!customBrandColors.includes(newColor)) {
      const updated = [...customBrandColors, newColor]
      setCustomBrandColors(updated)
      try {
        localStorage.setItem('aqua_custom_palette', JSON.stringify(updated))
        showFeedback(`Cor ${newColor} salva na paleta da marca`)
      } catch {
        // Ignora erros de localStorage
      }
    }
  }

  const removeCustomColor = (colorToRemove: string) => {
    const updated = customBrandColors.filter((c) => c !== colorToRemove)
    setCustomBrandColors(updated)
    try {
      localStorage.setItem('aqua_custom_palette', JSON.stringify(updated))
    } catch {
      // Ignora erros de localStorage
    }
  }

  const registerUploadedMedia = (newItems: UploadedMedia[]) => {
    try {
      const raw = localStorage.getItem(STORAGE_UPLOADS_KEY)
      const existing: StoredUploadMeta[] = raw ? JSON.parse(raw) : []
      const combined = [...existing]
      for (const item of newItems) {
        if (!combined.some((m) => m.hash === item.id)) {
          combined.unshift({
            hash: item.id,
            name: item.name,
            mime: item.mime,
            date: item.date || Date.now()
          })
        }
      }
      localStorage.setItem(STORAGE_UPLOADS_KEY, JSON.stringify(combined.slice(0, 50)))
    } catch (err) {
      console.warn('Erro ao registrar upload no Hub:', err)
    }
  }

  const processUploadedFiles = async (fileList: FileList, atPointer?: { x: number; y: number }) => {
    if (!fileList || fileList.length === 0) return
    const newlyCreated: UploadedMedia[] = []

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      if (!file.type.startsWith('image/')) continue

      const bytes = new Uint8Array(await file.arrayBuffer())
      const ref = await store.put(bytes, file.type)
      const blob = new Blob([bytes], { type: file.type })
      const url = URL.createObjectURL(blob)
      const newMedia: UploadedMedia = {
        id: ref.hash,
        name: file.name,
        url,
        mime: file.type,
        date: Date.now()
      }
      newlyCreated.push(newMedia)

      // Se foi solto em um ponto específico do canvas, insere imediatamente no cursor
      if (atPointer && renderer.current && f) {
        await renderer.current.addImage(url, {
          left: atPointer.x,
          top: atPointer.y,
          width: Math.round(f.width * 0.35)
        })
      }
    }

    if (newlyCreated.length > 0) {
      setUploads((prev) => [...newlyCreated, ...prev])
      registerUploadedMedia(newlyCreated)
      showFeedback(`${newlyCreated.length} imagem(ns) enviada(s) para a Galeria!`)
    }
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processUploadedFiles(e.target.files)
    }
    e.target.value = ''
  }

  const removeMediaFromGallery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setUploads((prev) => prev.filter((m) => m.id !== id))
    try {
      const raw = localStorage.getItem(STORAGE_UPLOADS_KEY)
      if (raw) {
        const list: StoredUploadMeta[] = JSON.parse(raw)
        const filtered = list.filter((m) => m.hash !== id)
        localStorage.setItem(STORAGE_UPLOADS_KEY, JSON.stringify(filtered))
      }
      showFeedback('Imagem removida da galeria')
    } catch {
      // Ignora erro
    }
  }

  const insertImageToCanvas = async (media: UploadedMedia, customPos?: { left: number; top: number }) => {
    if (!renderer.current || !f) return
    const left = customPos ? customPos.left : f.x + f.width * 0.15
    const top = customPos ? customPos.top : f.y + f.height * 0.15
    await renderer.current.addImage(media.url, {
      left,
      top,
      width: Math.round(f.width * 0.38)
    })
    showFeedback(`"${media.name}" inserida no canvas`)
  }

  const deleteSelected = () => {
    const sel = (renderer.current?.canvas as { getActiveObject?: () => { aquaNodeId?: string } | undefined })?.getActiveObject?.()
    if (sel?.aquaNodeId) {
      session.graph.deleteNode(sel.aquaNodeId)
      showFeedback('Elemento excluído')
    }
  }

  const fitCanvas = () => {
    if (f && renderer.current) {
      renderer.current.fit(f.id)
      showFeedback('Canvas enquadrado')
    }
  }

  const exportPng = async () => {
    const out = await runtime.exportForLaunch(itemId, 'image')
    if (out) download(out.bytes, 'aqua-design.png', out.mime)
  }

  // Tratamento de Drag & Drop para o Canvas
  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!isCanvasDragOver) setIsCanvasDragOver(true)
  }

  const handleCanvasDragLeave = (e: React.DragEvent) => {
    // Evita desligar o highlight quando passar sobre elementos filhos
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsCanvasDragOver(false)
  }

  const handleCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsCanvasDragOver(false)
    if (!renderer.current || !f) return

    // 1. Arquivos locais do computador soltos diretamente no Canvas
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const canvas = renderer.current.canvas as { getPointer?: (e: Event) => { x: number; y: number } }
      const pointer = canvas.getPointer ? canvas.getPointer(e.nativeEvent) : { x: f.x + f.width * 0.2, y: f.y + f.height * 0.2 }
      await processUploadedFiles(e.dataTransfer.files, pointer)
      return
    }

    // 2. Elementos arrastados das gavetas laterais (Formas, Tipografia, Uploads)
    const raw = e.dataTransfer.getData('application/aqua-design-item')
    if (!raw) return

    try {
      const data: DragTransferData = JSON.parse(raw)
      const canvas = renderer.current.canvas as { getPointer?: (e: Event) => { x: number; y: number } }
      const pointer = canvas.getPointer ? canvas.getPointer(e.nativeEvent) : { x: f.x + f.width * 0.2, y: f.y + f.height * 0.2 }

      // Coordenadas relativas ao artboard (FRAME)
      const relX = Math.round(pointer.x - f.x)
      const relY = Math.round(pointer.y - f.y)

      if (data.aquaKind === 'shape' && data.shapeType) {
        addShape(data.shapeType, relX, relY)
      } else if (data.aquaKind === 'text' && data.textVariant) {
        addTextPreset(data.textVariant, relX, relY)
      } else if (data.aquaKind === 'upload' && data.uploadUrl) {
        await renderer.current.addImage(data.uploadUrl, {
          left: pointer.x,
          top: pointer.y,
          width: Math.round(f.width * 0.35)
        })
        showFeedback('Imagem posicionada no local solto!')
      }
    } catch (err) {
      console.warn('Falha ao processar soltura no canvas:', err)
    }
  }

  return (
    <div className="design-studio-layout">
      {/* Barra de Ações Superior do Canvas */}
      <div className="design-top-bar">
        <div className="design-bar-group">
          <div className="tool-tab-switchers">
            <button
              type="button"
              className={`tool-tab-btn ${activeTab === 'shapes' ? 'active' : ''}`}
              onClick={() => setActiveTab('shapes')}
              title="Biblioteca de Formas & Vetores"
            >
              <ToolIcon name="shapes" size={15} />
              <span>Formas</span>
            </button>
            <button
              type="button"
              className={`tool-tab-btn ${activeTab === 'text' ? 'active' : ''}`}
              onClick={() => setActiveTab('text')}
              title="Kits de Tipografia Prontos"
            >
              <ToolIcon name="text" size={15} />
              <span>Tipografia</span>
            </button>
            <button
              type="button"
              className={`tool-tab-btn ${activeTab === 'brand' ? 'active' : ''}`}
              onClick={() => setActiveTab('brand')}
              title="Paleta da Marca (Brand Kit)"
            >
              <ToolIcon name="brand" size={15} />
              <span>Marca</span>
            </button>
            <button
              type="button"
              className={`tool-tab-btn ${activeTab === 'uploads' ? 'active' : ''}`}
              onClick={() => setActiveTab('uploads')}
              title="Galeria de Uploads Locais"
            >
              <ToolIcon name="uploads" size={15} />
              <span>Uploads</span>
              {uploads.length > 0 && <span className="tab-counter-badge">{uploads.length}</span>}
            </button>
          </div>
        </div>

        <div className="design-bar-group">
          {actionNotice && <span className="save-status-indicator pulse">{actionNotice}</span>}
          <UndoRedo itemId={itemId} refresh={refresh} />
          <button type="button" onClick={fitCanvas} title="Ajustar ao Canvas">
            <ToolIcon name="zoom" size={14} />
            <span>Enquadrar</span>
          </button>
          <button type="button" onClick={deleteSelected} title="Excluir Elemento Selecionado">
            <ToolIcon name="trash" size={14} color="#e11d48" />
          </button>
          <button className="primary" onClick={exportPng} type="button">
            Exportar PNG
          </button>
          {children}
        </div>
      </div>

      <div className="design-workspace">
        {/* Gaveta Lateral de Ferramentas Criativas estilo Canva / Adobe */}
        <div className="design-sidebar-drawer">
          {activeTab === 'shapes' && (
            <div className="drawer-panel">
              <h4 className="drawer-title">Formas & Elementos Vetoriais</h4>
              <p className="drawer-desc">Clique para adicionar ou arraste diretamente para a posição desejada:</p>

              <div className="shapes-grid">
                <button
                  type="button"
                  className="shape-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'RECTANGLE' }))
                  }}
                  onClick={() => addShape('RECTANGLE')}
                  title="Arrastar ou clicar para adicionar Retângulo"
                >
                  <div className="shape-preview"><ToolIcon name="rect" size={28} color="var(--blue)" /></div>
                  <div className="shape-label-row">
                    <span>Retângulo</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                </button>

                <button
                  type="button"
                  className="shape-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'ROUNDED_RECTANGLE' }))
                  }}
                  onClick={() => addShape('ROUNDED_RECTANGLE')}
                  title="Arrastar ou clicar para adicionar Retângulo Arredondado"
                >
                  <div className="shape-preview"><ToolIcon name="rounded-rect" size={28} color="var(--blue)" /></div>
                  <div className="shape-label-row">
                    <span>Arredondado</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                </button>

                <button
                  type="button"
                  className="shape-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'ELLIPSE' }))
                  }}
                  onClick={() => addShape('ELLIPSE')}
                  title="Arrastar ou clicar para adicionar Círculo"
                >
                  <div className="shape-preview"><ToolIcon name="circle" size={28} color="var(--blue)" /></div>
                  <div className="shape-label-row">
                    <span>Círculo</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                </button>

                <button
                  type="button"
                  className="shape-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'ARROW' }))
                  }}
                  onClick={() => addShape('ARROW')}
                  title="Arrastar ou clicar para adicionar Seta Direcional"
                >
                  <div className="shape-preview"><ToolIcon name="arrow" size={28} color="#009eff" /></div>
                  <div className="shape-label-row">
                    <span>Seta</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                </button>

                <button
                  type="button"
                  className="shape-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'STAR' }))
                  }}
                  onClick={() => addShape('STAR')}
                  title="Arrastar ou clicar para adicionar Estrela"
                >
                  <div className="shape-preview"><ToolIcon name="star" size={28} color="#f04c24" /></div>
                  <div className="shape-label-row">
                    <span>Estrela</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                </button>

                <button
                  type="button"
                  className="shape-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'POLYGON' }))
                  }}
                  onClick={() => addShape('POLYGON')}
                  title="Arrastar ou clicar para adicionar Triângulo / Polígono"
                >
                  <div className="shape-preview"><ToolIcon name="triangle" size={28} color="#0a9e6e" /></div>
                  <div className="shape-label-row">
                    <span>Triângulo</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                </button>
              </div>

              <div className="brand-section-divider" style={{ marginTop: 12, marginBottom: 10 }} />
              <h5 className="drawer-subtitle">Linhas & Divisórias Decorativas</h5>

              <div className="lines-list">
                <button
                  type="button"
                  className="line-item-btn"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'LINE' }))
                  }}
                  onClick={() => addShape('LINE')}
                  title="Linha Sólida Contínua"
                >
                  <ToolIcon name="line" size={24} color="var(--ink)" />
                  <span>Linha Sólida</span>
                  <ToolIcon name="drag" size={11} color="var(--muted)" />
                </button>

                <button
                  type="button"
                  className="line-item-btn"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'DASHED_LINE' }))
                  }}
                  onClick={() => addShape('DASHED_LINE')}
                  title="Linha Tracejada Decorativa"
                >
                  <ToolIcon name="dashed-line" size={24} color={NAZAR_PALETTE[0]} />
                  <span>Linha Tracejada</span>
                  <ToolIcon name="drag" size={11} color="var(--muted)" />
                </button>

                <button
                  type="button"
                  className="line-item-btn"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'shape', shapeType: 'DOTTED_LINE' }))
                  }}
                  onClick={() => addShape('DOTTED_LINE')}
                  title="Linha Pontilhada Decorativa"
                >
                  <ToolIcon name="dotted-line" size={24} color={NAZAR_PALETTE[2]} />
                  <span>Linha Pontilhada</span>
                  <ToolIcon name="drag" size={11} color="var(--muted)" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'text' && (
            <div className="drawer-panel">
              <h4 className="drawer-title">Kits de Tipografia Prontos</h4>
              <p className="drawer-desc">Clique para aplicar ou arraste direto para o ponto desejado no canvas:</p>

              <div className="text-combos-list">
                {/* Combo Principal 3-Níveis: Título + Subtítulo + Apoio */}
                <button
                  type="button"
                  className="text-combo-btn master-kit-style"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'text', textVariant: 'trio' }))
                  }}
                  onClick={() => addTextPreset('trio')}
                >
                  <div className="combo-top-row">
                    <span className="combo-badge-pill">Kit Completo 3 Níveis</span>
                    <ToolIcon name="drag" size={12} color="var(--muted)" />
                  </div>
                  <strong className="master-kit-headline">Título de Impacto</strong>
                  <span className="master-kit-subhead">Subtítulo Elegante & Conciso</span>
                  <p className="master-kit-body">Texto de apoio legível para equilibrar narrativa e proposta visual.</p>
                </button>

                <button
                  type="button"
                  className="text-combo-btn headline-style"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'text', textVariant: 'headline' }))
                  }}
                  onClick={() => addTextPreset('headline')}
                >
                  <div className="combo-top-row">
                    <span className="combo-main-title">Título de Impacto</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                  <small>Inter 64px · Negrito Bold 800</small>
                </button>

                <button
                  type="button"
                  className="text-combo-btn subhead-style"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'text', textVariant: 'subhead' }))
                  }}
                  onClick={() => addTextPreset('subhead')}
                >
                  <div className="combo-top-row">
                    <span className="combo-sub-title">Subtítulo Elegante</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                  <small>Inter 32px · Médio Semibold 600</small>
                </button>

                <button
                  type="button"
                  className="text-combo-btn body-style"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'text', textVariant: 'body' }))
                  }}
                  onClick={() => addTextPreset('body')}
                >
                  <div className="combo-top-row">
                    <span className="combo-body-title">Texto de Apoio / Parágrafo</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                  <small>Inter 16px · Regular 400</small>
                </button>

                <button
                  type="button"
                  className="text-combo-btn quote-style"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'text', textVariant: 'quote' }))
                  }}
                  onClick={() => addTextPreset('quote')}
                >
                  <div className="combo-top-row">
                    <span className="combo-label">Citação com Barra de Destaque</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                  <div className="quote-preview-wrap">
                    <span className="quote-accent-bar" />
                    <span className="quote-text-preview">“Frase impactante de autoridade”</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="text-combo-btn badge-style"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aqua-design-item', JSON.stringify({ aquaKind: 'text', textVariant: 'badge' }))
                  }}
                  onClick={() => addTextPreset('badge')}
                >
                  <div className="combo-top-row">
                    <span className="combo-label">Selo Promocional Arredondado</span>
                    <ToolIcon name="drag" size={11} color="var(--muted)" />
                  </div>
                  <span className="preview-pill-badge">NOVO LANÇAMENTO</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'brand' && (
            <div className="drawer-panel">
              <h4 className="drawer-title">Paleta da Marca (Brand Kit)</h4>
              <p className="drawer-desc">Pinte elementos ou mude o fundo do artboard em 1 clique:</p>

              {/* Seletor de Modo: Preenchimento vs Contorno */}
              <div className="color-mode-toggle">
                <button
                  type="button"
                  className={`color-mode-btn ${colorTarget === 'fill' ? 'active' : ''}`}
                  onClick={() => setColorTarget('fill')}
                >
                  Preenchimento
                </button>
                <button
                  type="button"
                  className={`color-mode-btn ${colorTarget === 'stroke' ? 'active' : ''}`}
                  onClick={() => setColorTarget('stroke')}
                >
                  Contorno / Borda
                </button>
              </div>

              <span className="palette-subhead">Paleta Oficial Nazar (AQUA)</span>
              <div className="palette-grid">
                {NAZAR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="palette-swatch"
                    style={{ backgroundColor: c }}
                    onClick={() => applyColor(c)}
                    title={`Aplicar ${c} (${colorTarget === 'fill' ? 'preenchimento' : 'contorno'})`}
                  />
                ))}
              </div>

              <div className="brand-section-divider" />

              <h4 className="drawer-title">Cores Salvas pelo Usuário</h4>
              <div className="custom-color-picker-row">
                <input
                  type="color"
                  className="native-color-input"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-add-color"
                  onClick={saveCustomColor}
                  title="Salvar cor na paleta da marca"
                >
                  <ToolIcon name="plus" size={13} />
                  <span>Salvar {newColor}</span>
                </button>
              </div>

              {customBrandColors.length > 0 && (
                <div className="custom-palette-grid">
                  {customBrandColors.map((c) => (
                    <div key={c} className="custom-swatch-wrap">
                      <button
                        type="button"
                        className="palette-swatch"
                        style={{ backgroundColor: c }}
                        onClick={() => applyColor(c)}
                        title={`Aplicar ${c}`}
                      />
                      <button
                        type="button"
                        className="swatch-remove-btn"
                        onClick={() => removeCustomColor(c)}
                        title="Remover cor salva"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <small className="note" style={{ display: 'block', marginTop: 10 }}>
                Dica: Selecione qualquer elemento para aplicar, ou clique sem seleção para alterar a cor de fundo do artboard.
              </small>
            </div>
          )}

          {activeTab === 'uploads' && (
            <div className="drawer-panel">
              <h4 className="drawer-title">Galeria de Uploads Locais</h4>
              <p className="drawer-desc">Envie fotos e ilustrações do seu computador. Reutilizáveis em qualquer design:</p>

              <button
                type="button"
                className="upload-dropzone-btn"
                onClick={() => uploadInputRef.current?.click()}
              >
                <ToolIcon name="uploads" size={24} color="var(--blue)" />
                <strong>Fazer Upload de Imagem</strong>
                <small>PNG, JPG, WebP ou SVG do computador</small>
              </button>
              <input
                type="file"
                ref={uploadInputRef}
                style={{ display: 'none' }}
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                multiple
                onChange={handleFileInputChange}
              />

              <div className="uploads-gallery-list">
                {uploads.map((media) => (
                  <div
                    key={media.id}
                    className="upload-media-card"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/aqua-design-item',
                        JSON.stringify({ aquaKind: 'upload', uploadId: media.id, uploadUrl: media.url })
                      )
                    }}
                    onClick={() => insertImageToCanvas(media)}
                    title={`Clique para inserir ou arraste para o canvas: "${media.name}"`}
                  >
                    <div className="upload-thumb-wrap">
                      <img src={media.url} alt={media.name} className="upload-preview-img" />
                      <button
                        type="button"
                        className="upload-delete-btn"
                        onClick={(e) => removeMediaFromGallery(media.id, e)}
                        title="Remover da galeria"
                      >
                        <ToolIcon name="trash" size={11} color="#fff" />
                      </button>
                      <div className="upload-drag-hint">
                        <ToolIcon name="drag" size={10} color="#fff" />
                      </div>
                    </div>
                    <span className="upload-media-name">{media.name}</span>
                  </div>
                ))}
                {uploads.length === 0 && (
                  <div className="empty-uploads-hint">
                    <p className="note" style={{ textAlign: 'center', margin: 0 }}>
                      Nenhuma imagem enviada ainda. Você também pode arrastar imagens do desktop direto para o canvas!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Área Central de Visualização e Edição do Canvas com Suporte a Drag & Drop */}
        <div
          className={`design-canvas-container ${isCanvasDragOver ? 'drag-over' : ''}`}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
        >
          {isCanvasDragOver && (
            <div className="canvas-drop-overlay">
              <div className="canvas-drop-pill">
                <ToolIcon name="plus" size={18} color="var(--blue)" />
                <span>Solte aqui para posicionar no design</span>
              </div>
            </div>
          )}
          <div ref={host} className="design-canvas-host" />
        </div>
      </div>
    </div>
  )
}

export default function DesignPanel({ itemId }: { itemId: string }) {
  return <Editor itemId={itemId} />
}
