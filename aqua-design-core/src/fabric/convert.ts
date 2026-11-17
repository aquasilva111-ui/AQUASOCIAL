import { Ellipse, FabricObject, FixedLayout, Gradient, Group, LayoutManager, Line, Polygon, Rect, Shadow, Textbox, type FabricObjectProps } from 'fabric'

import type { Color, Effect, Fill, SceneGraph, SceneNode, Stroke } from '../scene-graph'

export const AQUA_NODE_ID = 'aquaNodeId'

type TaggedObject = FabricObject & { [AQUA_NODE_ID]?: string }

const channel = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)

export function colorToCss(c: Color, opacity = 1): string {
  return `rgba(${channel(c.r)},${channel(c.g)},${channel(c.b)},${+(c.a * opacity).toFixed(3)})`
}

/** Solid fills and linear gradients (left to right; the Figma gradient matrix is not applied yet). */
function fillToPaint(fills: Fill[], width: number, height: number): string | Gradient<'linear'> | null {
  const f = fills.find((x) => x.visible && (x.type === 'SOLID' || (x.type === 'GRADIENT_LINEAR' && x.gradientStops?.length)))
  if (!f) return null
  if (f.type === 'SOLID') return colorToCss(f.color, f.opacity)
  return new Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: 0, y1: 0, x2: width, y2: 0 },
    colorStops: f.gradientStops!.map((s) => ({ offset: s.position, color: colorToCss(s.color, f.opacity) }))
  })
}

function strokeProps(strokes: Stroke[]): Partial<FabricObjectProps> {
  const s = strokes.find((x) => x.visible)
  if (!s) return { stroke: null, strokeWidth: 0 }
  return {
    stroke: colorToCss(s.color, s.opacity),
    strokeWidth: s.weight,
    strokeDashArray: s.dashPattern?.length ? s.dashPattern : null,
    strokeLineCap: s.cap === 'ROUND' ? 'round' : s.cap === 'SQUARE' ? 'square' : 'butt',
    strokeLineJoin: s.join === 'ROUND' ? 'round' : s.join === 'BEVEL' ? 'bevel' : 'miter'
  }
}

function shadowOf(effects: Effect[]): Shadow | null {
  const e = effects.find((x) => x.visible && x.type === 'DROP_SHADOW')
  if (!e) return null
  return new Shadow({ color: colorToCss(e.color), blur: e.radius, offsetX: e.offset.x, offsetY: e.offset.y })
}

function baseProps(node: SceneNode): Partial<FabricObjectProps> {
  return {
    left: node.x,
    top: node.y,
    originX: 'left',
    originY: 'top',
    angle: node.rotation,
    opacity: node.opacity,
    visible: node.visible,
    selectable: !node.locked,
    evented: !node.locked,
    fill: fillToPaint(node.fills, node.width, node.height),
    shadow: shadowOf(node.effects),
    ...strokeProps(node.strokes)
  }
}

/** Builds the Fabric object for one node; children of containers become a Group. */
export function nodeToFabric(graph: SceneGraph, node: SceneNode): FabricObject | null {
  const common = baseProps(node)
  const size = { width: node.width, height: node.height }
  let obj: FabricObject | null = null

  switch (node.type) {
    case 'RECTANGLE':
    case 'ROUNDED_RECTANGLE':
      obj = new Rect({ ...common, ...size, rx: node.cornerRadius, ry: node.cornerRadius })
      break
    case 'ELLIPSE':
      obj = new Ellipse({ ...common, rx: node.width / 2, ry: node.height / 2 })
      break
    case 'LINE':
      obj = new Line([0, 0, node.width, 0], { ...common, fill: null })
      break
    case 'STAR': {
      const points = []
      const spikes = 5
      const outerR = Math.min(node.width, node.height) / 2
      const innerR = outerR * 0.45
      const cx = node.width / 2
      const cy = node.height / 2
      let rot = (Math.PI / 2) * 3
      const step = Math.PI / spikes
      for (let i = 0; i < spikes; i++) {
        points.push({ x: cx + Math.cos(rot) * outerR, y: cy + Math.sin(rot) * outerR })
        rot += step
        points.push({ x: cx + Math.cos(rot) * innerR, y: cy + Math.sin(rot) * innerR })
        rot += step
      }
      obj = new Polygon(points, { ...common, width: node.width, height: node.height })
      break
    }
    case 'POLYGON': {
      if (node.name?.toLowerCase().includes('seta') || (node as unknown as { shapeKind?: string }).shapeKind === 'ARROW') {
        const w = node.width
        const h = node.height
        const points = [
          { x: 0, y: h * 0.32 },
          { x: w * 0.62, y: h * 0.32 },
          { x: w * 0.62, y: 0 },
          { x: w, y: h * 0.5 },
          { x: w * 0.62, y: h },
          { x: w * 0.62, y: h * 0.68 },
          { x: 0, y: h * 0.68 }
        ]
        obj = new Polygon(points, { ...common, width: node.width, height: node.height })
        break
      }
      const points = [
        { x: node.width / 2, y: 0 },
        { x: node.width, y: node.height },
        { x: 0, y: node.height }
      ]
      obj = new Polygon(points, { ...common, width: node.width, height: node.height })
      break
    }
    case 'TEXT':
      obj = new Textbox(node.text, {
        ...common,
        width: node.width,
        fontSize: node.fontSize,
        fontFamily: node.fontFamily,
        fontWeight: node.fontWeight,
        textAlign: node.textAlignHorizontal.toLowerCase() as 'left' | 'center' | 'right' | 'justify'
      })
      break
    case 'FRAME':
    case 'GROUP':
    case 'SECTION':
    case 'COMPONENT':
    case 'INSTANCE': {
      const kids = graph
        .getChildren(node.id)
        .map((c) => nodeToFabric(graph, c))
        .filter((o): o is FabricObject => o !== null)
      // Fixed-size group: Fabric positions group children relative to the group's centre,
      // so children (laid out parent-relative, origin top-left) are shifted by half the size.
      const hasBg = node.type !== 'GROUP'
      const bg = new Rect({
        ...size,
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        fill: hasBg ? common.fill : null,
        rx: node.cornerRadius,
        ry: node.cornerRadius,
        ...(hasBg ? strokeProps(node.strokes) : { stroke: null, strokeWidth: 0 })
      })
      const members = [bg, ...kids]
      for (const m of members) m.set({ left: m.left - node.width / 2, top: m.top - node.height / 2 })
      obj = new Group(members, {
        ...size,
        originX: 'left',
        originY: 'top',
        subTargetCheck: true,
        interactive: false,
        layoutManager: new LayoutManager(new FixedLayout())
      })
      obj.set({ left: node.x, top: node.y, angle: node.rotation, opacity: node.opacity, visible: node.visible, shadow: common.shadow })
      if (node.clipsContent) {
        obj.clipPath = new Rect({ ...size, left: -node.width / 2, top: -node.height / 2, originX: 'left', originY: 'top', rx: node.cornerRadius, ry: node.cornerRadius })
      }
      break
    }
    default:
      return null // VECTOR, BOOLEAN_OPERATION, STAR, POLYGON etc.: not bridged yet
  }
  ;(obj as TaggedObject)[AQUA_NODE_ID] = node.id
  return obj
}

/** Reads a moved/resized/rotated Fabric object back into scene-graph fields. */
export function fabricToNodeChanges(obj: FabricObject): Partial<SceneNode> {
  return {
    x: obj.left,
    y: obj.top,
    width: obj.getScaledWidth(),
    height: obj.getScaledHeight(),
    rotation: obj.angle,
    opacity: obj.opacity
  }
}

export function nodeIdOf(obj: FabricObject): string | undefined {
  return (obj as TaggedObject)[AQUA_NODE_ID]
}
