import { useState } from 'react'

import { addSlide, getNotes, setNotes, slidesOf } from 'aqua-design-core/src/presentation'
import type { DesignSession } from 'aqua-runtime/src/adapters/design'

import { download, runtime } from '../hub'
import { Editor } from './DesignPanel'

export default function PresentationPanel({ itemId }: { itemId: string }) {
  const [slide, setSlide] = useState<string | undefined>()
  const [, force] = useState(0)

  const act = async (fn: (s: DesignSession) => void | Promise<void>) => {
    const s = (await runtime.openItem(itemId)) as DesignSession
    await fn(s)
    force((n) => n + 1)
  }
  const sess = () => runtime.openItem(itemId) as Promise<DesignSession>

  return (
    <Editor itemId={itemId} slideId={slide}>
      <button onClick={() => act((s) => void setSlide(addSlide(s.presentation()).id))}>+ Slide</button>
      <SlidePicker itemId={itemId} slide={slide} onPick={setSlide} />
      <button
        onClick={async () => {
          const s = await sess()
          const html = s.toRevealHtml({ revealBase: '/reveal' })
          window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank')
        }}
      >
        Apresentar
      </button>
      <button className="primary" onClick={async () => download(await (await sess()).toPptx(), 'apresentacao.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')}>
        Baixar PPTX
      </button>
    </Editor>
  )
}

function SlidePicker({ itemId, slide, onPick }: { itemId: string; slide?: string; onPick: (id: string) => void }) {
  const [list, setList] = useState<{ id: string; name: string; notes: string }[]>([])
  const load = async () => {
    const s = (await runtime.openItem(itemId)) as DesignSession
    setList(slidesOf(s.presentation()).map((n) => ({ id: n.id, name: n.name, notes: getNotes(n) })))
  }
  const current = list.find((l) => l.id === slide) ?? list[0]
  return (
    <>
      <select value={current?.id ?? ''} onFocus={load} onChange={(e) => onPick(e.target.value)}>
        {(list.length ? list : [{ id: '', name: 'Slide 1', notes: '' }]).map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <button
        onClick={async () => {
          await load()
          const s = (await runtime.openItem(itemId)) as DesignSession
          const id = current?.id ?? slidesOf(s.presentation())[0].id
          const text = prompt('Notas do apresentador', getNotes(s.graph.getNode(id)!))
          if (text !== null) setNotes(s.presentation(), id, text)
        }}
      >
        Notas
      </button>
    </>
  )
}
