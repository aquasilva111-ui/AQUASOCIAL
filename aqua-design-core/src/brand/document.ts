import { SceneGraph, type Color, type Fill, type SceneNode } from '../scene-graph'
import { AQUA_BRAND_KIT, type BrandKit } from './kit'
import { AQUA, AQUA_FORMATS, type DesignFormatId } from './tokens'

export function hexToColor(hex: string): Color {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }
}

export const solid = (hex: string): Fill => ({ type: 'SOLID', color: hexToColor(hex), opacity: 1, visible: true })

export function linearGradient(stops: [number, string][]): Fill {
  return {
    type: 'GRADIENT_LINEAR',
    color: hexToColor(stops[0][1]),
    opacity: 1,
    visible: true,
    gradientStops: stops.map(([position, hex]) => ({ position, color: hexToColor(hex) }))
  }
}

export interface AquaDocument {
  graph: SceneGraph
  pageId: string
  artboard: SceneNode
}

/** New document: one page with an artboard of the given AQUA format and a white background. */
export function createAquaDocument(format: DesignFormatId = 'post'): AquaDocument {
  const { width, height, label } = AQUA_FORMATS[format]
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const artboard = graph.createNode('FRAME', page.id, {
    name: label,
    x: 0,
    y: 0,
    width,
    height,
    clipsContent: true,
    fills: [solid(AQUA.white)]
  })
  return { graph, pageId: page.id, artboard }
}

/** Headline + body text in the kit's fonts, ready to edit. */
export function addTitle(doc: AquaDocument, text: string, kit: BrandKit = AQUA_BRAND_KIT): SceneNode {
  const w = doc.artboard.width
  return doc.graph.createNode('TEXT', doc.artboard.id, {
    name: 'Título',
    text,
    x: w * 0.08,
    y: doc.artboard.height * 0.08,
    width: w * 0.84,
    height: w * 0.12,
    fontSize: Math.round(w * 0.075),
    fontFamily: kit.headingFont,
    fontWeight: 700,
    fills: [solid(AQUA.ink)]
  })
}
