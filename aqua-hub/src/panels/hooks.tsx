import { useEffect, useReducer, useState } from 'react'

import type { ToolSession } from 'aqua-runtime/src/types'

import { runtime } from '../hub'

/** Opens an item and re-renders the panel on every change of its session. */
export function useSession<S extends ToolSession>(itemId: string) {
  const [session, setSession] = useState<S | null>(null)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    let off = () => {}
    let dead = false
    runtime.openItem(itemId).then((s) => {
      if (dead) return
      setSession(s as S)
      off = s.onChange(bump)
    })
    return () => {
      dead = true
      off()
      void runtime.save(itemId, 'Fechado')
    }
  }, [itemId])
  return { session, refresh: bump }
}

/** Snapshot undo restores state without a change event, so the panel is told to redraw. */
export const UndoRedo = ({ itemId, refresh }: { itemId: string; refresh: () => void }) => (
  <>
    <button onClick={() => (runtime.undo(itemId), refresh())}>Desfazer</button>
    <button onClick={() => (runtime.redo(itemId), refresh())}>Refazer</button>
  </>
)
