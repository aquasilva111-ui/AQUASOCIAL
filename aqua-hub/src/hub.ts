import { createProject, IdbAssetStore, type ItemKind, type Project } from 'aqua-project/src/index'
import { FabricRenderer } from 'aqua-design-core/src/fabric/renderer'
import { audioAdapter } from 'aqua-runtime/src/adapters/audio'
import { chartAdapter } from 'aqua-runtime/src/adapters/chart'
import { docsAdapter } from 'aqua-runtime/src/adapters/docs'
import { designAdapter } from 'aqua-runtime/src/adapters/design'
import { mixAdapter } from 'aqua-runtime/src/adapters/mix'
import { musicAdapter } from 'aqua-runtime/src/adapters/music'
import { sheetAdapter } from 'aqua-runtime/src/adapters/sheet'
import { videoAdapter } from 'aqua-runtime/src/adapters/video'
import { CreativeRuntime } from 'aqua-runtime/src/runtime'
import { decodeWav, type Pcm } from 'aqua-runtime/src/render/wav'
import { MemoryHub } from 'aqua-runtime/src/transport'

const PROJECT_KEY = 'aqua-hub-project'

export const store = new IdbAssetStore('aqua-hub')

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(PROJECT_KEY)
    if (raw) return JSON.parse(raw) as Project
  } catch {
    /* fall through to a new project */
  }
  return createProject('Meu projeto')
}

const listeners = new Set<() => void>()
export const onProjectChange = (cb: () => void) => {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

/** Draws a design to PNG using an off-screen canvas. */
async function renderPng(graph: import('aqua-design-core/src/scene-graph/index').SceneGraph): Promise<Uint8Array> {
  const page = graph.getPages()[0]
  const frame = graph.getChildren(page.id).find((n) => n.type === 'FRAME')
  const el = document.createElement('canvas')
  const w = frame?.width ?? 1080
  const h = frame?.height ?? 1080
  const r = new FabricRenderer(graph, el, { width: w, height: h })
  r.canvas.backgroundColor = '#ffffff'
  r.showPage(page.id)
  if (frame) r.canvas.setViewportTransform([1, 0, 0, 1, -frame.x, -frame.y])
  const url = r.toDataURL(1)
  r.dispose()
  return dataUrlToBytes(url)
}

export const dataUrlToBytes = (url: string) => Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0))

async function rasterize(svg: string, width: number, height: number): Promise<Uint8Array> {
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return dataUrlToBytes(c.toDataURL('image/png'))
}

/** WAV is decoded in-house; MP3/M4A/OGG go through the browser's decoder. */
export async function decodeAny(bytes: Uint8Array): Promise<Pcm> {
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF') return decodeWav(bytes)
  const ctx = new AudioContext()
  try {
    const buf = await ctx.decodeAudioData(bytes.slice().buffer)
    return { sampleRate: buf.sampleRate, channels: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice()) }
  } finally {
    void ctx.close()
  }
}

export const collabHub = new MemoryHub() // single-tab for now; a network transport replaces it

export const runtime = new CreativeRuntime({
  project: loadProject(),
  store,
  autosaveMs: 800,
  transport: collabHub.connect(),
  onProject: (p) => {
    try {
      localStorage.setItem(PROJECT_KEY, JSON.stringify(p))
    } catch {
      /* storage full or blocked: the project stays in memory */
    }
    listeners.forEach((l) => l())
  },
  adapters: [
    docsAdapter,
    designAdapter('design', { renderPng }),
    designAdapter('presentation', { renderPng }),
    chartAdapter({ rasterize }),
    musicAdapter(),
    mixAdapter({ loadSource: async (h) => (await store.get(h))?.bytes, decode: decodeAny }),
    audioAdapter({ loadSource: async (h) => (await store.get(h))?.bytes, decode: decodeAny }),
    videoAdapter(),
    sheetAdapter()
  ]
})
export const KIND_LABEL: Partial<Record<ItemKind, string>> = {
  doc: 'Documento',
  design: 'Design',
  presentation: 'Apresentação',
  sheet: 'Planilha',
  video: 'Vídeo',
  audio: 'Áudio',
  mix: 'Mixagem',
  music: 'Música',
  chart: 'Gráfico'
}

export function download(bytes: Uint8Array, name: string, mime: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

if (import.meta.env.DEV) (window as unknown as { __hub: unknown }).__hub = { runtime, store }
