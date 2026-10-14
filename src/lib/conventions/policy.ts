import {clamp} from '#/lib/numbers'

/**
 * Replaceable policies. These numbers are a first documented version,
 * not a claim about the final mathematics of the theory.
 */

export type SignalPolicy = {
  weights: Record<string, number>
  unknownWeight: number
  shortViewMs: number
  longViewMs: number
  shortProgress: number
  longProgress: number
}

export type ActivationDecayPolicy = {
  halfLifeMs: number
  dormantAfterMs: number
  activeThreshold: number
  weakeningThreshold: number
  dormantThreshold: number
  emergingEvidenceMax: number
  positiveGain: number
  negativeGain: number
  reactivationWeight: number
  persistenceUnit: number
  depthUnit: number
}

export type ConfidencePolicy = {
  growth: number
  explicitFloor: number
  showMoreFloor: number
}

export type GravityWeights = {
  recurrence: number
  persistence: number
  activation: number
  confidence: number
  depth: number
  contexts: number
  synapses: number
  explicit: number
}

export type GravityPolicy = {
  weights: GravityWeights
  contextScale: number
}

export type CollectiveGravityPolicy = {
  volumeScale: number
  actorScale: number
  creatorScale: number
  communityScale: number
  socialScale: number
  velocityScale: number
  actorCap: number
  creatorCap: number
  timestampCap: number
  weights: {
    volume: number
    actors: number
    creators: number
    communities: number
    social: number
    depth: number
    persistence: number
    velocity: number
  }
}

export type SynapsePolicy = {
  minRecurrence: number
  strengthDivisor: number
  strongThreshold: number
  sessionGapMs: number
}

export type SaturationPolicy = {
  windowMs: number
  fullAt: number
  exposureCap: number
}

export type RankBlendPolicy = {
  personalRelevance: number
  personalGravity: number
  collectiveGravity: number
  novelty: number
  saturation: number
}

export const DEFAULT_SIGNAL_POLICY: SignalPolicy = {
  weights: {
    impression: 0.04,
    view: 0.22,
    short_view: 0.08,
    long_view: 0.48,
    unique_view: 0.26,
    video_start: 0.12,
    video_progress: 0.3,
    video_complete: 0.55,
    play: 0.18,
    pause: 0.1,
    click: 0.4,
    expand: 0.35,
    watch_time: 0.45,
    live_join: 0.2,
    live_leave: 0.12,
    live_watch_time: 0.45,
    like: 0.5,
    repost: 0.72,
    save: 0.78,
    follow: 0.82,
    comment: 0.55,
    search: 0.8,
    show_more: 0.95,
    show_less: -0.92,
    mute: -1,
    unmute: 0.15,
    pin: 1,
    remove: -1,
    purchase: 0.7,
    subscribe: 0.75,
    create: 0.6,
    edit: 0.35,
    publish: 0.66,
    join: 0.6,
  },
  unknownWeight: 0.1,
  shortViewMs: 3_000,
  longViewMs: 30_000,
  shortProgress: 0.15,
  longProgress: 0.7,
}

export const DEFAULT_DECAY_POLICY: ActivationDecayPolicy = {
  halfLifeMs: 14 * 24 * 60 * 60 * 1000,
  dormantAfterMs: 30 * 24 * 60 * 60 * 1000,
  activeThreshold: 0.4,
  weakeningThreshold: 0.35,
  dormantThreshold: 0.12,
  emergingEvidenceMax: 3,
  positiveGain: 0.85,
  negativeGain: 1,
  reactivationWeight: 0.3,
  persistenceUnit: 8,
  depthUnit: 4,
}

export const DEFAULT_CONFIDENCE_POLICY: ConfidencePolicy = {
  growth: 0.45,
  explicitFloor: 0.95,
  showMoreFloor: 0.9,
}

export const DEFAULT_GRAVITY_POLICY: GravityPolicy = {
  weights: {
    recurrence: 0.18,
    persistence: 0.14,
    activation: 0.18,
    confidence: 0.14,
    depth: 0.1,
    contexts: 0.08,
    synapses: 0.1,
    explicit: 0.08,
  },
  contextScale: 4,
}

export const DEFAULT_COLLECTIVE_GRAVITY_POLICY: CollectiveGravityPolicy = {
  volumeScale: 8,
  actorScale: 10,
  creatorScale: 5,
  communityScale: 3,
  socialScale: 8,
  velocityScale: 10,
  actorCap: 500,
  creatorCap: 200,
  timestampCap: 30,
  weights: {
    volume: 0.22,
    actors: 0.22,
    creators: 0.12,
    communities: 0.08,
    social: 0.12,
    depth: 0.08,
    persistence: 0.08,
    velocity: 0.08,
  },
}

export const DEFAULT_SYNAPSE_POLICY: SynapsePolicy = {
  minRecurrence: 2,
  strengthDivisor: 4,
  strongThreshold: 0.7,
  sessionGapMs: 30 * 60 * 1000,
}

export const DEFAULT_SATURATION_POLICY: SaturationPolicy = {
  windowMs: 24 * 60 * 60 * 1000,
  fullAt: 8,
  exposureCap: 100,
}

/**
 * Small blend on top of the existing rank. Collective weight stays below
 * personal weight so a network-wide topic cannot take over one person's feed.
 * Not wired into the feed.
 */
export const DEFAULT_RANK_BLEND: RankBlendPolicy = {
  personalRelevance: 0.35,
  personalGravity: 0.2,
  collectiveGravity: 0.08,
  novelty: 0.05,
  saturation: 0.35,
}

export type SignalContext = {
  watchMs?: number
  visibleMs?: number
  progress?: number
}

export function getSignalWeight(
  eventType: string,
  context: SignalContext = {},
  policy: SignalPolicy = DEFAULT_SIGNAL_POLICY,
): number {
  let weight = policy.weights[eventType] ?? policy.unknownWeight
  if (
    eventType === 'view' ||
    eventType === 'watch_time' ||
    eventType === 'video_progress' ||
    eventType === 'live_watch_time'
  ) {
    const ms = context.watchMs ?? context.visibleMs
    if (ms != null && ms < policy.shortViewMs)
      weight = policy.weights.short_view
    else if (ms != null && ms >= policy.longViewMs)
      weight = policy.weights.long_view
    else if (
      context.progress != null &&
      context.progress < policy.shortProgress
    )
      weight = policy.weights.short_view
    else if (
      context.progress != null &&
      context.progress >= policy.longProgress
    )
      weight = policy.weights.long_view
  }
  return clamp(weight, -1, 1)
}
