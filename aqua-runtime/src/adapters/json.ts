import type { ToolSession } from '../types'

/** A tool whose document is plain JSON state. Edits go through `update`, which notifies and is undoable. */
export type JsonSession<S> = ToolSession & {
  readonly state: S
  update(fn: (draft: S) => void): void
}

export function jsonSession<S>(initial: S, extra: Partial<ToolSession> = {}): JsonSession<S> {
  let state = initial
  const listeners = new Set<() => void>()
  const enc = () => new TextEncoder().encode(JSON.stringify(state))
  return {
    get state() {
      return state
    },
    update(fn) {
      const draft = structuredClone(state)
      fn(draft)
      state = draft
      listeners.forEach((l) => l())
    },
    serialize: enc,
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    restore(bytes) {
      state = JSON.parse(new TextDecoder().decode(bytes)) as S
    },
    dispose() {
      listeners.clear()
    },
    ...extra
  }
}

export const parseJson = <S>(bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as S
