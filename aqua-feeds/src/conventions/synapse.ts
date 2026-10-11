// Sinapses do usuário: duas Convenções que aparecem em sinais POSITIVOS
// diferentes dentro da mesma sessão (pausa < 30 min), por faixa do dia.
import {type Context, contextOf} from './extract.ts'
import type {ConventionKey} from './model.ts'

export interface SignalEvent {
  createdAt: string
  weight: number
  keys: ConventionKey[]
}

export interface SynapseObservation {
  a: ConventionKey
  b: ConventionKey
  context: Context
  /** quando a coocorrência se completou (o sinal mais recente do par) */
  at: string
}

export const SESSION_GAP_MINUTES = 30

export function synapsesFromEvents(
  events: SignalEvent[],
  opts: {sessionGapMinutes?: number; offsetMinutes?: number} = {},
): SynapseObservation[] {
  const gap = (opts.sessionGapMinutes ?? SESSION_GAP_MINUTES) * 60_000
  const sorted = events
    .filter(e => e.weight > 0 && e.keys.length)
    .sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt))
  const out = new Map<string, SynapseObservation>()
  let session: SignalEvent[] = []
  let last = -Infinity
  for (const e of sorted) {
    const t = Date.parse(e.createdAt)
    if (t - last > gap) session = []
    last = t
    const context = contextOf(e.createdAt, opts.offsetMinutes)
    for (const prev of session) {
      for (const k1 of prev.keys)
        for (const k2 of e.keys) {
          if (k1 === k2) continue
          const [a, b] = k1 < k2 ? [k1, k2] : [k2, k1]
          const id = `${a}\u0000${b}\u0000${context}`
          out.set(id, {a, b, context, at: e.createdAt})
        }
    }
    session.push(e)
  }
  return [...out.values()].sort((x, y) =>
    x.at === y.at ? (x.a + x.b).localeCompare(y.a + y.b) : x.at < y.at ? -1 : 1,
  )
}
