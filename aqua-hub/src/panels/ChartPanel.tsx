import { chartToSvg, type ChartSession, type ChartSpec } from 'aqua-runtime/src/adapters/chart'

import { download, runtime } from '../hub'
import { UndoRedo, useSession } from './hooks'

const toText = (s: ChartSpec) => s.categories.map((c, i) => [c, ...s.series.map((x) => x.values[i] ?? 0)].join(',')).join('\n')

function fromText(text: string, names: string[]): Pick<ChartSpec, 'categories' | 'series'> {
  const rows = text.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((r) => r[0])
  const n = Math.max(1, ...rows.map((r) => r.length - 1))
  return {
    categories: rows.map((r) => r[0]),
    series: Array.from({ length: n }, (_, k) => ({ name: names[k] ?? `Série ${k + 1}`, values: rows.map((r) => Number(r[k + 1]) || 0) }))
  }
}

export default function ChartPanel({ itemId }: { itemId: string }) {
  const { session, refresh } = useSession<ChartSession>(itemId)
  if (!session) return <p className="note">Abrindo…</p>
  const s = session.state
  return (
    <>
      <div className="row">
        <label className="field">Título <input value={s.title} onChange={(e) => session.update((d) => void (d.title = e.target.value))} /></label>
        <label className="field">Tipo
          <select value={s.type} onChange={(e) => session.update((d) => void (d.type = e.target.value as ChartSpec['type']))}>
            <option value="bar">Barras</option><option value="line">Linha</option><option value="pie">Pizza</option>
          </select>
        </label>
        <UndoRedo itemId={itemId} refresh={refresh} />
        <button className="primary" onClick={async () => {
          const out = await runtime.exportForLaunch(itemId, 'image')
          if (out) download(out.bytes, 'grafico.png', out.mime)
        }}>Exportar PNG</button>
      </div>
      <p className="note">Dados: uma linha por categoria, "nome,valor1,valor2…".</p>
      <textarea key={s.categories.join('|') + s.series.length} rows={6} cols={40} defaultValue={toText(s)}
        onBlur={(e) => session.update((d) => Object.assign(d, fromText(e.target.value, d.series.map((x) => x.name))))} />
      <div style={{ maxWidth: 560 }} dangerouslySetInnerHTML={{ __html: chartToSvg({ ...s, width: 560, height: 420 }) }} />
    </>
  )
}
