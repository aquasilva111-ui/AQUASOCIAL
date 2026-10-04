import * as echarts from 'echarts'

import type { ToolAdapter } from '../types'
import { jsonSession, parseJson, type JsonSession } from './json'

/** A chart is data + a type; ECharts options are derived, so the file stays small and diffable. */
export interface ChartSpec {
  title: string
  type: 'bar' | 'line' | 'pie'
  categories: string[]
  series: { name: string; values: number[] }[]
  /** Brand colours (the user's kit) in order of use. */
  colors: string[]
  width: number
  height: number
}

export const defaultChart = (title: string): ChartSpec => ({
  title,
  type: 'bar',
  categories: ['A', 'B', 'C'],
  series: [{ name: 'Série 1', values: [3, 5, 2] }],
  colors: ['#002BEF', '#009EFF', '#F04C24', '#0F172A'],
  width: 1080,
  height: 1080
})

export function toEchartsOption(spec: ChartSpec): echarts.EChartsCoreOption {
  const base = { color: spec.colors, title: { text: spec.title, left: 'center' }, animation: false, textStyle: { fontFamily: 'Inter' } }
  if (spec.type === 'pie') {
    const s = spec.series[0]
    return { ...base, series: [{ type: 'pie', radius: '60%', data: spec.categories.map((name, i) => ({ name, value: s?.values[i] ?? 0 })) }] }
  }
  return {
    ...base,
    legend: { bottom: 0 },
    xAxis: { type: 'category', data: spec.categories },
    yAxis: { type: 'value' },
    series: spec.series.map((s) => ({ name: s.name, type: spec.type, data: s.values }))
  }
}

/** Server-side render to SVG: no DOM needed (ECharts SSR). */
export function chartToSvg(spec: ChartSpec): string {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: spec.width, height: spec.height })
  chart.setOption(toEchartsOption(spec))
  const svg = chart.renderToSVGString()
  chart.dispose()
  return svg
}

export interface ChartAdapterOptions {
  /** SVG -> PNG for destinations that need a raster (browser canvas / server). Absent: no image export. */
  rasterize?: (svg: string, width: number, height: number) => Promise<Uint8Array>
}

export type ChartSession = JsonSession<ChartSpec> & { toSvg(): string }

export function chartAdapter(opts: ChartAdapterOptions = {}): ToolAdapter {
  const make = (spec: ChartSpec): ChartSession => {
    const s = jsonSession(spec, {
      async export(capability) {
        if (capability !== 'image' || !opts.rasterize) return undefined
        return { bytes: await opts.rasterize(chartToSvg(s.state), s.state.width, s.state.height), mime: 'image/png' }
      }
    }) as ChartSession
    s.toSvg = () => chartToSvg(s.state)
    return s
  }
  return { kind: 'chart', mime: 'application/vnd.aqua.chart+json', create: (name) => make(defaultChart(name)), open: (b) => make(parseJson<ChartSpec>(b)) }
}
