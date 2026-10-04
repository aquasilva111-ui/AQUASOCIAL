import type { ToolAdapter } from '../types'
import { jsonSession, parseJson, type JsonSession } from './json'

/**
 * Sheets document. The content is Univer's workbook snapshot (`IWorkbookData`, Apache-2.0), kept
 * opaque here: Univer runs in the UI (DOM) and hands the runtime snapshots, so this package needs
 * no Univer dependency and the file stays Univer-native. Cell helpers exist for tests, imports and
 * "table as image / chart" features that read values without booting the spreadsheet.
 */
export interface SheetDoc {
  title: string
  /** Univer `IWorkbookData`; undefined until the UI saves its first snapshot. */
  workbook?: Record<string, unknown>
  /** Quick read model of the first sheet: rows of cell values, kept in sync by `setSnapshot`. */
  values: (string | number | boolean | null)[][]
}

export type SheetSession = JsonSession<SheetDoc> & {
  /** Called by the UI with Univer's current snapshot and the first sheet's values. */
  setSnapshot(workbook: Record<string, unknown>, values: SheetDoc['values']): void
  setCell(row: number, col: number, value: string | number | boolean | null): void
}

export interface SheetAdapterOptions {
  /** Table -> PNG for the Launch Hub (canvas in the browser, server otherwise). Absent: no export. */
  renderImage?: (doc: SheetDoc) => Promise<Uint8Array>
}

export function sheetAdapter(opts: SheetAdapterOptions = {}): ToolAdapter {
  const make = (doc: SheetDoc): SheetSession => {
    const s = jsonSession(doc, {
      async export(capability) {
        if (capability !== 'image' || !opts.renderImage) return undefined
        return { bytes: await opts.renderImage(s.state), mime: 'image/png' }
      }
    }) as SheetSession
    s.setSnapshot = (workbook, values) =>
      s.update((d) => {
        d.workbook = workbook
        d.values = values
      })
    s.setCell = (row, col, value) =>
      s.update((d) => {
        while (d.values.length <= row) d.values.push([])
        const r = d.values[row]
        while (r.length <= col) r.push(null)
        r[col] = value
      })
    return s
  }
  return { kind: 'sheet', mime: 'application/vnd.aqua.sheet+json', create: (title) => make({ title, values: [] }), open: (b) => make(parseJson<SheetDoc>(b)) }
}
