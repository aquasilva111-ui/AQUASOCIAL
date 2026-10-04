import PptxGenJS from 'pptxgenjs'

import { solid } from './brand/document'
import { AQUA } from './brand/tokens'
import { SceneGraph, type Color, type Fill, type SceneNode } from './scene-graph'

/**
 * Presentations are a document mode of the Design Core, not a second editor:
 * a presentation is one page whose top-level frames are the slides, in order.
 */
export const SLIDE = { width: 1920, height: 1080, gap: 160 } as const
const PLUGIN = 'aqua-presentation'

export interface Presentation {
  graph: SceneGraph
  pageId: string
}

export function createPresentation(title = 'Apresentação'): Presentation {
  const graph = new SceneGraph()
  const pageId = graph.getPages()[0].id
  const p = { graph, pageId }
  const first = addSlide(p, AQUA.white)
  graph.createNode('TEXT', first.id, {
    name: 'Título',
    text: title,
    x: 160,
    y: 380,
    width: 1600,
    height: 160,
    fontSize: 120,
    fontFamily: 'Inter',
    fontWeight: 700,
    fills: [solid(AQUA.ink)]
  })
  return p
}

export function slidesOf(p: Presentation): SceneNode[] {
  return p.graph.getChildren(p.pageId).filter((n) => n.type === 'FRAME')
}

export function addSlide(p: Presentation, background: string = AQUA.white): SceneNode {
  const index = slidesOf(p).length
  return p.graph.createNode('FRAME', p.pageId, {
    name: `Slide ${index + 1}`,
    x: 0,
    y: index * (SLIDE.height + SLIDE.gap),
    width: SLIDE.width,
    height: SLIDE.height,
    clipsContent: true,
    fills: [solid(background)]
  })
}

export function setNotes(p: Presentation, slideId: string, notes: string): void {
  const node = p.graph.getNode(slideId)
  if (!node) throw new Error(`Slide not found: ${slideId}`)
  const rest = node.pluginData.filter((e) => !(e.pluginId === PLUGIN && e.key === 'notes'))
  p.graph.updateNode(slideId, { pluginData: [...rest, { pluginId: PLUGIN, key: 'notes', value: notes }] })
}

export function getNotes(node: SceneNode): string {
  return node.pluginData.find((e) => e.pluginId === PLUGIN && e.key === 'notes')?.value ?? ''
}

const hex = (c: Color) =>
  [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()

const firstColor = (fills: Fill[]): Color | undefined => {
  const f = fills.find((x) => x.visible && (x.type === 'SOLID' || x.gradientStops?.length))
  return f?.type === 'SOLID' ? f.color : f?.gradientStops?.[0].color
}

/** 1920 px = 13.333 in (16:9), so 144 px per inch. */
const inch = (px: number) => px / 144
const pt = (px: number) => (px / 144) * 72

/**
 * PPTX via PptxGenJS. Covers rectangle, rounded rectangle, ellipse and text with solid
 * fills; gradients fall back to their first stop (PptxGenJS has no gradient fill).
 */
export async function toPptx(p: Presentation, title = 'Apresentação AQUA'): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'AQUA_16_9', width: inch(SLIDE.width), height: inch(SLIDE.height) })
  pptx.layout = 'AQUA_16_9'
  pptx.title = title

  for (const frame of slidesOf(p)) {
    const slide = pptx.addSlide()
    const bg = firstColor(frame.fills)
    if (bg) slide.background = { color: hex(bg) }
    const notes = getNotes(frame)
    if (notes) slide.addNotes(notes)

    for (const n of p.graph.getChildren(frame.id)) {
      if (!n.visible) continue
      const box = { x: inch(n.x), y: inch(n.y), w: inch(n.width), h: inch(n.height) }
      const fill = firstColor(n.fills)
      const stroke = n.strokes.find((s) => s.visible)
      const line = stroke ? { color: hex(stroke.color), width: pt(stroke.weight) } : undefined
      if (n.type === 'TEXT') {
        slide.addText(n.text, {
          ...box,
          fontFace: n.fontFamily,
          fontSize: pt(n.fontSize),
          bold: n.fontWeight >= 600,
          color: fill ? hex(fill) : AQUA.ink.slice(1),
          align: n.textAlignHorizontal === 'JUSTIFIED' ? 'justify' : (n.textAlignHorizontal.toLowerCase() as 'left' | 'center' | 'right'),
          valign: 'top',
          margin: 0
        })
      } else if (n.type === 'ELLIPSE') {
        slide.addShape(pptx.ShapeType.ellipse, { ...box, fill: fill ? { color: hex(fill) } : undefined, line })
      } else if (n.type === 'RECTANGLE' || n.type === 'ROUNDED_RECTANGLE') {
        const round = n.cornerRadius > 0
        slide.addShape(round ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
          ...box,
          fill: fill ? { color: hex(fill) } : undefined,
          line,
          rectRadius: round ? Math.min(0.5, inch(n.cornerRadius) / Math.min(box.w, box.h)) : undefined
        })
      }
    }
  }
  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const css = (c: Color, a = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${+(c.a * a).toFixed(3)})`

export interface RevealOptions {
  /** Where reveal.js `dist/` is served from (npm `reveal.js`). */
  revealBase?: string
  title?: string
}

/** A self-contained reveal.js page: 1920x1080 stage, absolutely positioned elements, speaker notes. */
export function toRevealHtml(p: Presentation, opts: RevealOptions = {}): string {
  const base = (opts.revealBase ?? 'reveal.js/dist').replace(/\/$/, '')
  const sections = slidesOf(p)
    .map((frame) => {
      const bg = firstColor(frame.fills)
      const items = p.graph
        .getChildren(frame.id)
        .filter((n) => n.visible)
        .map((n) => {
          const pos = `left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;opacity:${n.opacity}`
          const f = n.fills.find((x) => x.visible && x.type === 'SOLID')
          const fillCss = f ? css(f.color, f.opacity) : 'transparent'
          const s = n.strokes.find((x) => x.visible)
          const border = s ? `border:${s.weight}px solid ${css(s.color, s.opacity)};box-sizing:border-box;` : ''
          if (n.type === 'TEXT') {
            return `<div style="position:absolute;${pos};color:${fillCss};font:${n.fontWeight} ${n.fontSize}px/1.15 '${esc(n.fontFamily)}',sans-serif;text-align:${n.textAlignHorizontal === 'JUSTIFIED' ? 'justify' : n.textAlignHorizontal.toLowerCase()};white-space:pre-wrap">${esc(n.text)}</div>`
          }
          if (n.type === 'ELLIPSE' || n.type === 'RECTANGLE' || n.type === 'ROUNDED_RECTANGLE') {
            const radius = n.type === 'ELLIPSE' ? '50%' : `${n.cornerRadius}px`
            return `<div style="position:absolute;${pos};background:${fillCss};border-radius:${radius};${border}"></div>`
          }
          return ''
        })
        .join('')
      const notes = getNotes(frame)
      return `<section data-background-color="${bg ? css(bg) : '#fff'}"><div style="position:relative;width:${SLIDE.width}px;height:${SLIDE.height}px;margin:0 auto;text-align:left">${items}</div>${notes ? `<aside class="notes">${esc(notes)}</aside>` : ''}</section>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(opts.title ?? 'Apresentação AQUA')}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${base}/reset.css"><link rel="stylesheet" href="${base}/reveal.css"><link rel="stylesheet" href="${base}/theme/white.css">
</head><body><div class="reveal"><div class="slides">
${sections}
</div></div>
<script src="${base}/reveal.js"></script>
<script>Reveal.initialize({width:${SLIDE.width},height:${SLIDE.height},margin:0,hash:true,controls:true,progress:true});</script>
</body></html>`
}
