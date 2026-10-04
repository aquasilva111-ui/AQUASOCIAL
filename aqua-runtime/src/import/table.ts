/** Reading pasted or dropped tables (CSV/TSV/semicolon) for the chart and sheet tools. */

export interface Table {
  /** First row, when it looks like column titles (its cells after the first are not numbers). */
  header: string[] | null
  rows: string[][]
  delimiter: string
}

const DELIMS = [',', ';', '\t', '|']

/** Splits one line honouring double quotes ("a,b" stays one cell; "" is a quote inside quotes). */
function splitLine(line: string, d: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"', i++)
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === d) (out.push(cur), (cur = ''))
    else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

/** Numbers as people write them: 1234.5, 1.234,5 (pt-BR), 12%, R$ 3,50, -4. Returns NaN when it is not one. */
export function parseNumber(raw: string): number {
  let s = raw.trim().replace(/^(R\$|US\$|\$|€|£)\s*/, '').replace(/\s*%$/, '')
  if (!s || !/^[-+]?[\d.,\s]+$/.test(s)) return NaN
  s = s.replace(/\s/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (lastComma >= 0) s = (s.match(/,/g) ?? []).length === 1 && s.length - lastComma - 1 !== 3 ? s.replace(',', '.') : s.replace(/,/g, '')
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export function parseTable(text: string, maxRows = 500): Table {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, maxRows + 1)
  if (!lines.length) return { header: null, rows: [], delimiter: ',' }
  // the delimiter that splits the first lines into the most (and most consistent) cells
  const score = (d: string) => {
    const counts = lines.slice(0, 5).map((l) => splitLine(l, d).length)
    return counts.every((c) => c === counts[0]) && counts[0] > 1 ? counts[0] : 0
  }
  const delimiter = DELIMS.map((d) => [d, score(d)] as const).sort((a, b) => b[1] - a[1])[0][1] > 0 ? DELIMS.map((d) => [d, score(d)] as const).sort((a, b) => b[1] - a[1])[0][0] : ','
  const all = lines.map((l) => splitLine(l, delimiter))
  const first = all[0]
  const header = all.length > 1 && first.slice(1).every((c) => Number.isNaN(parseNumber(c))) && first.slice(1).some((c) => c !== '') ? first : null
  return { header, rows: header ? all.slice(1) : all, delimiter }
}

export interface ChartData {
  categories: string[]
  series: { name: string; values: number[] }[]
}

/**
 * Table to chart data: the first column names the categories, every other column that is mostly
 * numeric becomes a series. A single numeric column gets categories 1..n. Null when nothing is numeric.
 */
export function tableToChart(t: Table): ChartData | null {
  if (!t.rows.length) return null
  const width = Math.max(...t.rows.map((r) => r.length))
  const colNumeric = (c: number) => {
    const cells = t.rows.map((r) => r[c] ?? '').filter((x) => x !== '')
    return cells.length > 0 && cells.filter((x) => !Number.isNaN(parseNumber(x))).length / cells.length >= 0.8
  }
  const numeric = Array.from({ length: width }, (_, c) => c).filter(colNumeric)
  if (!numeric.length) return null
  // Column 0 names the categories (text, or numbers such as years) unless it is the only numeric column.
  const labelled = !(numeric.length === 1 && numeric[0] === 0)
  const dataCols = labelled ? numeric.filter((c) => c !== 0) : numeric
  if (!dataCols.length) return null
  return {
    categories: t.rows.map((r, i) => (labelled ? (r[0] ?? '') || String(i + 1) : String(i + 1))),
    series: dataCols.map((c, i) => ({ name: t.header?.[c] || `Série ${i + 1}`, values: t.rows.map((r) => { const n = parseNumber(r[c] ?? ''); return Number.isNaN(n) ? 0 : n }) }))
  }
}
