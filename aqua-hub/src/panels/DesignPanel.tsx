import { useEffect, useRef } from 'react'

import { AQUA_BRAND_KIT } from 'aqua-design-core/src/brand/kit'
import { hexToColor, solid } from 'aqua-design-core/src/brand/document'
import { FabricRenderer } from 'aqua-design-core/src/fabric/renderer'
import type { DesignSession } from 'aqua-runtime/src/adapters/design'

import { download, runtime } from '../hub'
import { UndoRedo, useSession } from './hooks'

/** Design and Presentations edit the same graph; `slideId` frames which artboard is in view. */
export function Editor({ itemId, slideId, children }: { itemId: string; slideId?: string; children?: React.ReactNode }) {
  const { session, refresh } = useSession<DesignSession>(itemId)
  const host = useRef<HTMLDivElement>(null)
  const renderer = useRef<FabricRenderer | null>(null)

  const frames = () => (session ? session.graph.getChildren(session.graph.getPages()[0].id).filter((n) => n.type === 'FRAME') : [])
  const target = () => frames().find((f) => f.id === slideId) ?? frames()[0]

  // React owns only the empty container: Fabric wraps and moves the <canvas>, so the canvas is created
  // here and removed here, never rendered by React.
  useEffect(() => {
    const el = host.current
    if (!session || !el) return
    if (!renderer.current) {
      const c = document.createElement('canvas')
      el.appendChild(c)
      renderer.current = new FabricRenderer(session.graph, c, { interactive: true, width: 900, height: 620 })
    }
    const r = renderer.current
    r.graph = session.graph // snapshot undo swaps the graph object
    if (import.meta.env.DEV) (window as unknown as { __renderer?: unknown }).__renderer = r
    r.showPage(session.graph.getPages()[0].id)
    const f = target()
    if (f) r.fit(f.id)
  })

  useEffect(
    () => () => {
      renderer.current?.dispose()
      renderer.current = null
      if (host.current) host.current.innerHTML = ''
    },
    []
  )

  if (!session) return <p className="note">Abrindo…</p>
  const f = target()
  const add = (type: 'TEXT' | 'RECTANGLE' | 'ELLIPSE') => {
    if (!f) return
    const common = { x: f.width * 0.1, y: f.height * 0.3, fills: [solid(AQUA_BRAND_KIT.colors[0])] }
    if (type === 'TEXT')
      session.graph.createNode('TEXT', f.id, { ...common, text: 'Seu texto', width: f.width * 0.6, height: 120, fontSize: Math.round(f.width * 0.06), fontFamily: AQUA_BRAND_KIT.headingFont, fontWeight: 700 })
    else session.graph.createNode(type, f.id, { ...common, width: f.width * 0.25, height: f.width * 0.25 })
  }
  const exportPng = async () => {
    const out = await runtime.exportForLaunch(itemId, 'image')
    if (out) download(out.bytes, 'aqua-design.png', out.mime)
  }
  const color = (hex: string) => {
    const sel = (renderer.current?.canvas as { getActiveObject?: () => { aquaNodeId?: string } | undefined })?.getActiveObject?.()
    if (sel?.aquaNodeId) session.graph.updateNode(sel.aquaNodeId, { fills: [{ ...solid(hex), color: hexToColor(hex) }] })
  }

  return (
    <>
      <div className="row">
        <button onClick={() => add('TEXT')}>+ Texto</button>
        <button onClick={() => add('RECTANGLE')}>+ Retângulo</button>
        <button onClick={() => add('ELLIPSE')}>+ Elipse</button>
        <UndoRedo itemId={itemId} refresh={refresh} />
        <button className="primary" onClick={exportPng}>Exportar PNG</button>
        {children}
      </div>
      <div className="row">
        <span className="note">Cor do objeto selecionado:</span>
        {AQUA_BRAND_KIT.colors.map((c) => (
          <button key={c} title={c} onClick={() => color(c)} style={{ background: c, width: 26, height: 26, padding: 0, borderRadius: 13 }} />
        ))}
      </div>
      <div ref={host} />
    </>
  )
}

export default function DesignPanel({ itemId }: { itemId: string }) {
  return <Editor itemId={itemId} />
}
