import {
  type ActivationDecayPolicy,
  DEFAULT_DECAY_POLICY,
} from '#/lib/conventions/policy'
import {type Convention, type ConventionStatus} from '#/lib/conventions/types'
import {clamp} from '#/lib/numbers'

/** Half-life decay. History is kept; only activation moves. */
export function decayedActivation(
  activation: number,
  elapsedMs: number,
  halfLifeMs: number,
): number {
  if (elapsedMs <= 0 || halfLifeMs <= 0) return clamp(activation, 0, 1)
  return clamp(activation * Math.pow(0.5, elapsedMs / halfLifeMs), 0, 1)
}

export function deriveStatus(
  convention: Pick<
    Convention,
    | 'activation'
    | 'evidenceCount'
    | 'hasBeenActive'
    | 'removed'
    | 'explicitOverride'
    | 'lastSeenAt'
  >,
  nowMs: number,
  policy: ActivationDecayPolicy = DEFAULT_DECAY_POLICY,
): ConventionStatus {
  if (convention.removed || convention.explicitOverride === 'mute')
    return 'dormant'
  const age = nowMs - Date.parse(convention.lastSeenAt)
  if (convention.activation >= policy.activeThreshold) return 'active'
  if (
    convention.activation <= policy.dormantThreshold &&
    age >= policy.dormantAfterMs
  )
    return 'dormant'
  if (
    convention.hasBeenActive &&
    convention.activation < policy.weakeningThreshold
  )
    return age >= policy.dormantAfterMs ? 'dormant' : 'weakening'
  if (
    !convention.hasBeenActive &&
    convention.evidenceCount < policy.emergingEvidenceMax
  )
    return 'emerging'
  return 'weakening'
}

export function materializeDecay(
  convention: Convention,
  nowIso: string,
  policy: ActivationDecayPolicy = DEFAULT_DECAY_POLICY,
): Convention {
  const nowMs = Date.parse(nowIso)
  const fromMs = Date.parse(convention.decayedAt)
  const elapsed =
    Number.isFinite(nowMs) && Number.isFinite(fromMs) ? nowMs - fromMs : 0
  const activation = decayedActivation(
    convention.activation,
    elapsed,
    policy.halfLifeMs,
  )
  const next: Convention = {
    ...convention,
    activation,
    decayedAt: Number.isFinite(nowMs)
      ? new Date(nowMs).toISOString()
      : convention.decayedAt,
    activationByContext: {...convention.activationByContext},
  }
  for (const key of Object.keys(next.activationByContext)) {
    next.activationByContext[key] = decayedActivation(
      next.activationByContext[key],
      elapsed,
      policy.halfLifeMs,
    )
  }
  next.status = deriveStatus(next, nowMs, policy)
  return next
}
