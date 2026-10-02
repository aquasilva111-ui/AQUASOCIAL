import * as Plot from '@observablehq/plot'
import { parseHTML } from 'linkedom'
import * as vega from 'vega'
import { compile, type TopLevelSpec } from 'vega-lite'

/** Vega-Lite (BSD-3) spec to SVG, headless: compile to Vega, run a View without DOM. */
export async function vegaLiteToSvg(spec: TopLevelSpec): Promise<string> {
  const vg = compile(spec).spec
  const view = new vega.View(vega.parse(vg), { renderer: 'none' })
  const svg = await view.toSVG()
  view.finalize()
  return svg
}

export interface PlotSpec {
  mark: 'barY' | 'line' | 'dot' | 'areaY'
  data: Record<string, number | string>[]
  x: string
  y: string
  fill?: string
  width?: number
  height?: number
}

/** Observable Plot (ISC) for quick tabular exploration; rendered into a DOM-less document (linkedom). */
export function plotToSvg(spec: PlotSpec): string {
  const { document } = parseHTML('<!doctype html><html><body></body></html>')
  const options = { x: spec.x, y: spec.y, fill: spec.fill ?? '#002BEF', stroke: spec.mark === 'line' ? (spec.fill ?? '#002BEF') : undefined }
  const mark = Plot[spec.mark](spec.data, options as never)
  const el = Plot.plot({ document: document as unknown as Document, width: spec.width ?? 640, height: spec.height ?? 400, marks: [mark] })
  return el.outerHTML ?? String(el)
}
