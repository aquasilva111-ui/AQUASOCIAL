// Cursor de paginação: "<snapshot>::<posição>". O ranking é congelado num
// snapshot, então rolar a lista não pula nem repete posts mesmo que os
// números mudem entre uma página e outra.

export interface FeedCursor {
  snapshot: number
  offset: number
}

export function encodeCursor(c: FeedCursor): string {
  return `${c.snapshot}::${c.offset}`
}

export function decodeCursor(raw: string | undefined): FeedCursor | undefined {
  if (!raw) return undefined
  const m = /^(\d{1,16})::(\d{1,7})$/.exec(raw)
  if (!m) return undefined
  return {snapshot: Number(m[1]), offset: Number(m[2])}
}
