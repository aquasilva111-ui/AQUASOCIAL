import {
  DEFAULT_SYNAPSE_POLICY,
  type SynapsePolicy,
} from '#/lib/conventions/policy'
import {
  CONVENTION_SCHEMA_VERSION,
  type ConventionSynapse,
} from '#/lib/conventions/types'
import {clamp} from '#/lib/numbers'

export type SessionCooccurrence = {
  at: number
  ids: string[]
  /** Pair counts that have not necessarily become synapses yet. */
  pairs: Record<string, number>
}

export function emptySession(nowMs = 0): SessionCooccurrence {
  return {at: nowMs, ids: [], pairs: {}}
}

export function synapseId(a: string, b: string, context?: string): string {
  const [from, to] = a < b ? [a, b] : [b, a]
  return context ? `synapse:${from}:${to}:${context}` : `synapse:${from}:${to}`
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * One event can record a co-occurrence. A synapse is written only after the
 * configured recurrence, so a single coincidence does not become a relation.
 * Correlation is not identity, belief, or a psychological claim.
 */
export function detectSynapses(input: {
  session: SessionCooccurrence
  incomingIds: string[]
  nowMs: number
  existing: Record<string, ConventionSynapse>
  context?: string
  policy?: SynapsePolicy
}): {
  session: SessionCooccurrence
  synapses: Record<string, ConventionSynapse>
  touchedIds: string[]
} {
  const policy = input.policy ?? DEFAULT_SYNAPSE_POLICY
  const stale = input.nowMs - input.session.at > policy.sessionGapMs
  const previous = stale ? [] : input.session.ids
  const pairs = stale ? {} : {...input.session.pairs}
  const previousSet = new Set(previous)
  const considered = new Set<string>()

  function consider(a: string, b: string) {
    if (!a || !b || a === b) return
    const key = pairKey(a, b)
    if (considered.has(key)) return
    considered.add(key)
    pairs[key] = (pairs[key] ?? 0) + 1
  }

  for (const a of input.incomingIds) {
    for (const b of previousSet) consider(a, b)
    for (const b of input.incomingIds) consider(a, b)
  }

  const synapses = {...input.existing}
  const touchedIds: string[] = []
  const nowIso = new Date(input.nowMs).toISOString()
  for (const [key, recurrence] of Object.entries(pairs)) {
    if (!considered.has(key) || recurrence < policy.minRecurrence) continue
    const [from, to] = key.split('|')
    if (!from || !to) continue
    const id = synapseId(from, to, input.context)
    const current = synapses[id]
    const strength = clamp(
      recurrence / (recurrence + policy.strengthDivisor),
      0,
      1,
    )
    synapses[id] = {
      schemaVersion: CONVENTION_SCHEMA_VERSION,
      id,
      fromConventionId: from,
      toConventionId: to,
      context: input.context,
      strength,
      confidence: clamp(1 - Math.exp(-0.35 * recurrence), 0, 1),
      recurrence,
      firstSeenAt: current?.firstSeenAt ?? nowIso,
      lastActivatedAt: nowIso,
      version: (current?.version ?? 0) + 1,
    }
    touchedIds.push(id)
  }

  return {
    session: {
      at: input.nowMs,
      ids: [...new Set([...previous, ...input.incomingIds])].slice(-24),
      pairs,
    },
    synapses,
    touchedIds,
  }
}

export function synapseStrengthFor(
  conventionId: string,
  synapses: Record<string, ConventionSynapse>,
): number {
  let total = 0
  let count = 0
  for (const synapse of Object.values(synapses)) {
    if (synapse.strength <= 0) continue
    if (
      synapse.fromConventionId === conventionId ||
      synapse.toConventionId === conventionId
    ) {
      total += synapse.strength
      count += 1
    }
  }
  return count === 0 ? 0 : total / count
}
