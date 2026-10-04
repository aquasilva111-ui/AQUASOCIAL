import { useEffect, useMemo, useState } from 'react'

import { listVersions } from 'aqua-project/src/index'
import { docStats, docStatsFromBytes, editSessions, wordSeries, type DocStats, type VersionPoint } from 'aqua-runtime/src/index'
import { DOCS_FRAGMENT, type docSession } from 'aqua-runtime/src/adapters/docs'

import { runtime, store } from '../hub'
import { Icon, IconButton } from './Icon'

type DocSession = ReturnType<typeof docSession>
type View = 'overview' | 'structure' | 'history'
type Range = 'all' | '7d' | '1d'
const RANGES: { id: Range; label: string; ms: number }[] = [
  { id: 'all', label: 'Tudo', ms: Infinity },
  { id: '7d', label: '7 dias', ms: 7 * 864e5 },
  { id: '1d', label: 'Hoje', ms: 864e5 }
]

const wordsByHash = new Map<string, number>() // a version's words never change, so this cache never expires
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const mins = (m: number) => (m < 1 ? '< 1 min' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`)

function Metric({ icon, label, value, unit, bar, sub }: { icon: string; label: string; value: string | number; unit?: string; bar?: number; sub?: React.ReactNode }) {
  return (
    <div className="an-card an-metric">
      <div className="top">
        <span className="an-ic">{icon}</span>
        <span className="lbl">{label}</span>
      </div>
      <div className="an-big">{value}{unit && <small>{unit}</small>}</div>
      {bar !== undefined && <div className="an-bar"><i style={{ width: `${Math.max(2, Math.min(100, bar * 100))}%` }} /></div>}
      {sub && <div className="an-sub">{sub}</div>}
    </div>
  )
}

function Spark({ points, color = '#7dffb2' }: { points: number[]; color?: string }) {
  if (points.length < 2) return <div className="lbl" style={{ padding: '18px 0' }}>Salve mais versões para ver a evolução.</div>
  const W = 420
  const H = 90
  const max = Math.max(...points, 1)
  const min = Math.min(...points)
  const y = (v: number) => H - 8 - ((v - min) / Math.max(max - min, 1)) * (H - 20)
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Palavras ao longo das versões">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={color} opacity=".12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <circle cx={xs[xs.length - 1]} cy={y(points[points.length - 1])} r="4.5" fill={color} />
    </svg>
  )
}

export default function DocAnalytics({ session, itemId, onEdit }: { session: DocSession; itemId: string; onEdit: () => void }) {
  const item = runtime.project.items.find((i) => i.id === itemId)
  const [view, setView] = useState<View>('overview')
  const [range, setRange] = useState<Range>('all')
  const [stats, setStats] = useState<DocStats>(() => docStats(session.doc.getXmlFragment(DOCS_FRAGMENT)))
  const [series, setSeries] = useState<VersionPoint[]>([])
  const [goal, setGoal] = useState(() => {
    try {
      return Math.max(10, +(localStorage.getItem(`aqua-doc-goal:${itemId}`) ?? 500) || 500)
    } catch {
      return 500
    }
  })

  // Live numbers: recomputed shortly after every edit.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const off = session.onChange(() => {
      clearTimeout(t)
      t = setTimeout(() => setStats(docStats(session.doc.getXmlFragment(DOCS_FRAGMENT))), 300)
    })
    setStats(docStats(session.doc.getXmlFragment(DOCS_FRAGMENT)))
    return () => (clearTimeout(t), off())
  }, [session])

  // History: words of every saved version (cached by hash; versions are immutable).
  const versions = listVersions(runtime.project, itemId)
  const vkey = versions.map((v) => v.id).join(',')
  useEffect(() => {
    let live = true
    void (async () => {
      const pts: { at: string; message: string; words: number }[] = []
      for (const v of versions.slice(-60)) {
        let w = wordsByHash.get(v.hash)
        if (w === undefined) {
          const blob = await store.get(v.hash)
          if (!blob) continue
          w = docStatsFromBytes(blob.bytes).words
          wordsByHash.set(v.hash, w)
        }
        pts.push({ at: v.at, message: v.message, words: w })
      }
      if (live) setSeries(wordSeries(pts))
    })()
    return () => void (live = false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vkey])

  const now = Date.now()
  const rms = RANGES.find((r) => r.id === range)!.ms
  const shown = useMemo(() => series.filter((p) => now - Date.parse(p.at) <= rms), [series, rms, now])
  const sessions = editSessions(versions.map((v) => v.at))
  const first = series[0]?.words ?? 0
  const gained = stats.words - first
  const wordsNow = [...shown.map((p) => p.words), stats.words]
  const level = stats.readingLevel
  const setGoalSaved = (n: number) => {
    setGoal(n)
    try {
      localStorage.setItem(`aqua-doc-goal:${itemId}`, String(n))
    } catch {
      /* private mode: the goal lasts for this session */
    }
  }

  const t0 = shown.length ? Date.parse(shown[0].at) : now
  const span = Math.max(Date.parse(shown[shown.length - 1]?.at ?? '') - t0, 1)
  const pos = (iso: string) => (shown.length > 1 ? 4 + ((Date.parse(iso) - t0) / span) * 92 : 50)
  const zoom = (d: number) => setRange(RANGES[Math.max(0, Math.min(RANGES.length - 1, RANGES.findIndex((r) => r.id === range) + d))].id)

  const outline = (
    <div className="an-list">
      {stats.headings.length ? stats.headings.map((h, i) => (
        <div className="an-row" key={i} style={{ marginLeft: (h.level - 1) * 12 }}>
          <span className="lv">H{h.level}</span>
          <span className="t">{h.text}</span>
        </div>
      )) : <div className="an-empty">Sem títulos ainda. Use “/” no editor para criar títulos e ver a estrutura aqui.</div>}
    </div>
  )

  return (
    <div className="an">
      <aside className="an-side">
        <div className="an-sticky">
        <div className="an-profile">
          <div className="an-avatar">{(item?.name || 'D').slice(0, 1).toUpperCase()}</div>
          <b>{item?.name || 'Sem título'}</b>
          <small>{versions.length} {versions.length === 1 ? 'versão' : 'versões'} · {stats.words} palavras</small>
        </div>
        <nav className="an-nav">
          {([['overview', 'home', 'Visão geral'], ['structure', 'list', 'Estrutura'], ['history', 'clock', 'Histórico']] as const).map(([id, ic, label]) => (
            <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}><span className="ic"><Icon name={ic} size={15} /></span>{label}</button>
          ))}
          <button onClick={onEdit}><span className="ic"><Icon name="edit" size={15} /></span>Voltar ao editor</button>
        </nav>
        <div className="an-foot">{item ? `Atualizado ${when(item.updatedAt)}` : ''}</div>
        </div>
      </aside>

      <section className="an-main">
        <div className="an-chips">
          {RANGES.map((r) => (
            <button key={r.id} className={'an-chip' + (range === r.id ? ' on' : '')} onClick={() => setRange(r.id)}><i />{r.label}</button>
          ))}
          <span className="an-empty" style={{ padding: 0, marginLeft: 6 }}>período do gráfico e da linha do tempo</span>
        </div>

        {view === 'overview' && (
          <div className="an-grid">
            <Metric icon="✎" label="Palavras" value={stats.words} bar={stats.words / goal}
              sub={<><span>{stats.words}/{goal}</span><span>meta <input type="number" min={10} step={50} value={goal} onChange={(e) => setGoalSaved(Math.max(10, +e.target.value || 500))} /></span></>} />
            <Metric icon="◷" label="Tempo de leitura" value={stats.readingMin < 1 ? '<1' : Math.round(stats.readingMin)} unit="min" bar={Math.min(1, stats.readingMin / 10)} sub={<><span>falando: {mins(stats.speakingMin)}</span><span>200 pal/min</span></>} />
            <Metric icon="❝" label="Frases" value={stats.sentences} bar={Math.min(1, stats.avgSentenceWords / 30)} sub={<><span>média {stats.avgSentenceWords.toFixed(1)} pal/frase</span><span>maior {stats.longestSentenceWords}</span></>} />

            <div className="an-card an-hero">
              <span className="tag">Legibilidade: {level}{stats.words ? ` · ${Math.round(stats.fleschPt)}` : ''}</span>
              <h2>{item?.name || 'Sem título'}</h2>
              <div className="acts"><button className="an-round" title="Editar" aria-label="Editar" onClick={onEdit}><Icon name="edit" size={18} /></button></div>
            </div>
            <div className="an-card an-black">
              <div className="top" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="an-ic" style={{ background: '#1b1c1f' }}>↗</span><span className="lbl">Palavras por versão</span></div>
              <div className="an-big">{stats.words}<small style={{ color: '#9a9da4' }}>palavras</small><sup>{series.length ? `${gained >= 0 ? '+' : ''}${gained}` : ''}</sup></div>
              <Spark points={wordsNow} />
            </div>

            <div className="an-card an-wide"><h4><span className="an-ic">☰</span>Estrutura</h4>{outline}</div>
            <div className="an-card an-wide">
              <h4><span className="an-ic">#</span>Palavras mais usadas</h4>
              {stats.keywords.length ? <div className="an-kw">{stats.keywords.map((k) => <span key={k.word}>{k.word}<b>{k.count}</b></span>)}</div> : <div className="an-empty">Escreva um pouco mais para aparecerem as palavras-chave.</div>}
              <div className="an-sub" style={{ marginTop: 14 }}><span>variedade de vocabulário {Math.round(stats.uniqueRatio * 100)}%</span><span>palavra média {stats.avgWordLength.toFixed(1)} letras</span></div>
            </div>

            <Metric icon="⏱" label="Sessões de edição" value={sessions.sessions} bar={Math.min(1, sessions.sessions / 10)} sub={<><span>≈ {mins(sessions.activeMin)} escrevendo</span><span>estimativa</span></>} />
            <Metric icon="¶" label="Parágrafos" value={stats.paragraphs} bar={Math.min(1, stats.paragraphs / 20)} sub={<><span>{stats.charsNoSpaces} caracteres sem espaços</span></>} />
            <Metric icon="◈" label="Versões salvas" value={versions.length} bar={Math.min(1, versions.length / 30)} sub={<><span>{sessions.first ? `desde ${when(sessions.first)}` : ''}</span></>} />
          </div>
        )}

        {view === 'structure' && (
          <div className="an-grid">
            <Metric icon="H" label="Títulos" value={stats.headings.length} bar={Math.min(1, stats.headings.length / 10)} sub={<span>H1: {stats.headings.filter((h) => h.level === 1).length} · H2: {stats.headings.filter((h) => h.level === 2).length} · H3+: {stats.headings.filter((h) => h.level > 2).length}</span>} />
            <Metric icon="•" label="Listas" value={stats.bullets + stats.numbered} bar={Math.min(1, (stats.bullets + stats.numbered) / 20)} sub={<span>{stats.bullets} com marcadores · {stats.numbered} numerados</span>} />
            <Metric icon="☑" label="Tarefas" value={`${stats.checks.done}/${stats.checks.total}`} bar={stats.checks.total ? stats.checks.done / stats.checks.total : 0} sub={<span>{stats.checks.total ? `${Math.round((stats.checks.done / stats.checks.total) * 100)}% concluídas` : 'nenhuma lista de tarefas'}</span>} />
            <Metric icon="▣" label="Imagens" value={stats.images} />
            <Metric icon="▦" label="Tabelas" value={stats.tables} />
            <Metric icon="❝" label="Citações e código" value={`${stats.quotes} / ${stats.codeBlocks}`} sub={<span>citações / blocos de código (código não conta nas palavras)</span>} />
            <div className="an-card" style={{ gridColumn: 'span 12' }}><h4><span className="an-ic">☰</span>Estrutura completa</h4>{outline}</div>
          </div>
        )}

        {view === 'history' && (
          <div className="an-grid">
            <div className="an-card an-black" style={{ gridColumn: 'span 12' }}>
              <div className="top" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="an-ic" style={{ background: '#1b1c1f' }}>↗</span><span className="lbl">Evolução do texto</span></div>
              <Spark points={wordsNow} />
            </div>
            <div className="an-card" style={{ gridColumn: 'span 12' }}>
              <h4><span className="an-ic">◷</span>Versões salvas</h4>
              <div className="an-list">
                {[...series].reverse().map((p, i) => (
                  <div className="an-row" key={i}>
                    <span className="lv">{when(p.at)}</span>
                    <span className="t">{p.message || 'Salvo'}</span>
                    <span>{p.words} pal.</span>
                    <span className={'d ' + (p.delta >= 0 ? 'up' : 'down')}>{p.delta >= 0 ? '+' : ''}{p.delta}</span>
                  </div>
                ))}
                {!series.length && <div className="an-empty">O histórico aparece depois do primeiro salvamento.</div>}
              </div>
            </div>
          </div>
        )}

        <div className="an-time">
          <div className="an-pm"><button className="an-round dark" title="Ampliar período" aria-label="Ampliar período" onClick={() => zoom(1)}><Icon name="plus" size={16} /></button><button className="an-round dark" title="Ver mais" aria-label="Ver mais" onClick={() => zoom(-1)}><Icon name="minus" size={16} /></button></div>
          <div className="track" aria-label="Linha do tempo das versões">
            <div className="line" />
            {shown.length > 1 && <div className="win" style={{ left: '2%', right: '2%', background: 'transparent', color: '#8a8d94', top: 'auto', bottom: -4 }}>{when(shown[0].at)} → {when(shown[shown.length - 1].at)}</div>}
            {shown.map((p, i) => <span key={i} className="dot" style={{ left: `${pos(p.at)}%` }} title={`${when(p.at)} · ${p.words} palavras (${p.delta >= 0 ? '+' : ''}${p.delta})`} />)}
            {!shown.length && <div className="an-empty" style={{ position: 'absolute', left: 8, top: 6 }}>Nenhuma versão neste período.</div>}
          </div>
        </div>
      </section>
    </div>
  )
}
