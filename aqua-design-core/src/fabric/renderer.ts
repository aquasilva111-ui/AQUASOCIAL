import { Canvas, Rect, StaticCanvas, type FabricObject } from 'fabric'

import { AQUA_CANVAS, applyAquaFabricTheme } from '../brand/fabric-theme'
import type { SceneGraph } from '../scene-graph'
import { fabricToNodeChanges, nodeIdOf, nodeToFabric } from './convert'

export interface FabricRendererOptions {
  /** Interactive canvas (selection, drag, resize) when true; plain render otherwise. */
  interactive?: boolean
  width?: number
  height?: number
  /** Workspace colour behind the artboard; defaults to the AQUA light surface. */
  dark?: boolean
}

/**
 * Renders one page of a SceneGraph on a Fabric canvas and, in interactive mode,
 * writes user edits back to the graph (so undo, snap and export stay in the core).
 */
export class FabricRenderer {
  readonly canvas: StaticCanvas | Canvas
  private pageId: string | null = null
  /** Workspace colour; Fabric's `clear()` wipes the canvas background, so it is reapplied on refresh. */
  workspace: string

  constructor(
    public graph: SceneGraph,
    el: HTMLCanvasElement | string,
    opts: FabricRendererOptions = {}
  ) {
    applyAquaFabricTheme()
    const size = { width: opts.width, height: opts.height }
    this.canvas = opts.interactive ? new Canvas(el, size) : new StaticCanvas(el, size)
    this.workspace = opts.dark ? AQUA_CANVAS.backgroundDark : AQUA_CANVAS.backgroundLight
    this.canvas.backgroundColor = this.workspace
    if (this.canvas instanceof Canvas) {
      this.canvas.on('object:modified', ({ target }) => this.writeBack(target))
    }
  }

  showPage(pageId: string): void {
    this.pageId = pageId
    this.refresh()
  }

  refresh(): void {
    if (!this.pageId) return
    this.canvas.clear()
    this.canvas.backgroundColor = this.workspace
    for (const node of this.graph.getChildren(this.pageId)) {
      if (node.type === 'FRAME') this.addArtboard(node.id)
      else this.add(nodeToFabric(this.graph, node))
    }
    this.canvas.requestRenderAll()
  }

  /** Top-level frames are artboards: a fixed backdrop plus their children as editable objects. */
  private addArtboard(frameId: string): void {
    const frame = this.graph.getNode(frameId)!
    const bg = nodeToFabric(this.graph, { ...frame, childIds: [], type: 'RECTANGLE' })
    if (bg) {
      bg.set({ selectable: false, evented: false, hoverCursor: 'default' })
      this.canvas.add(bg)
    }
    for (const child of this.graph.getChildren(frameId)) {
      const obj = nodeToFabric(this.graph, child)
      if (!obj) continue
      obj.set({ left: obj.left + frame.x, top: obj.top + frame.y })
      this.add(obj)
    }
  }

  private add(obj: FabricObject | null): void {
    if (obj) this.canvas.add(obj)
  }

  /** Zooms and pans so the frame fits the canvas with a small margin (used for slides and artboards). */
  fit(frameId: string, margin = 24): void {
    const f = this.graph.getNode(frameId)
    if (!f) return
    const k = Math.min((this.canvas.getWidth() - margin * 2) / f.width, (this.canvas.getHeight() - margin * 2) / f.height)
    this.canvas.setViewportTransform([k, 0, 0, k, margin - f.x * k, margin - f.y * k])
    this.canvas.requestRenderAll()
  }

  toDataURL(multiplier = 1): string {
    return this.canvas.toDataURL({ format: 'png', multiplier })
  }

  toSVG(): string {
    return this.canvas.toSVG()
  }

  dispose(): void {
    void this.canvas.dispose()
  }

  private writeBack(target: FabricObject | undefined): void {
    const id = target && nodeIdOf(target)
    if (!id) return
    const node = this.graph.getNode(id)
    const parent = node?.parentId ? this.graph.getNode(node.parentId) : undefined
    const changes = fabricToNodeChanges(target)
    // Children of a top-level artboard are drawn in canvas space; the graph stores them parent-relative.
    if (parent?.type === 'FRAME') {
      changes.x = (changes.x ?? 0) - parent.x
      changes.y = (changes.y ?? 0) - parent.y
    }
    this.graph.updateNode(id, changes)
  }
}
