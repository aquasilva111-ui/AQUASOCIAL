import {
  DEFAULT_GRAVITY_POLICY,
  type GravityPolicy,
} from '#/lib/conventions/policy'
import {type Convention} from '#/lib/conventions/types'
import {clamp} from '#/lib/numbers'

export type PersonalGravityInput = {
  convention: Convention
  synapseStrength: number
}

/**
 * v1 personal gravity. Relational presence, not a like count.
 * Replace `GravityPolicy` to change the formula.
 */
export function personalGravity(
  input: PersonalGravityInput,
  policy: GravityPolicy = DEFAULT_GRAVITY_POLICY,
): number {
  const {convention} = input
  if (convention.removed || convention.explicitOverride === 'mute') return 0
  const recurrence = 1 - Math.exp(-convention.recurrence / 6)
  const explicit =
    convention.explicitOverride === 'pin' ||
    convention.explicitOverride === 'show_more'
      ? 1
      : 0
  const weights = policy.weights
  return clamp(
    weights.recurrence * recurrence +
      weights.persistence * convention.persistence +
      weights.activation * convention.activation +
      weights.confidence * convention.confidence +
      weights.depth * convention.depth +
      weights.contexts *
        clamp(convention.contexts.length / policy.contextScale, 0, 1) +
      weights.synapses * clamp(input.synapseStrength, 0, 1) +
      weights.explicit * explicit,
    0,
    1,
  )
}
