/**
 * Reality Convention engine.
 *
 * Events become conventions, synapses, and syntheses. The feed keeps its
 * own rank. This module is off until a caller enables it, and a failure
 * here returns neutral ranking signals.
 */

export {
  decayedActivation,
  deriveStatus,
  materializeDecay,
} from '#/lib/conventions/activation/decay'
export {confidenceFromMass} from '#/lib/conventions/activation/update'
export {
  attachConventionEngine,
  recordViewForConventions,
} from '#/lib/conventions/bridge'
export {
  type ConventionDebugView,
  inspectConventions,
} from '#/lib/conventions/debug'
export {
  type ConventionEventSink,
  createConventionEventSink,
} from '#/lib/conventions/events/sink'
export {
  type ViewEventLike,
  viewEventToSemanticEvent,
} from '#/lib/conventions/events/view-adapter'
export {createRuleBasedExtractor} from '#/lib/conventions/extraction/rule-based'
export {
  type SemanticExtractor,
  type SemanticHit,
} from '#/lib/conventions/extraction/types'
export {PENDING_INTEGRATIONS} from '#/lib/conventions/future'
export {stableContextKeys} from '#/lib/conventions/graph/context'
export {
  activeConventions,
  byGravity,
  dormantConventions,
  emergingConventions,
  relatedConventionIds,
  weakeningConventions,
} from '#/lib/conventions/graph/queries'
export {
  diffGraphs,
  graphFromSnapshot,
  takeSnapshot,
} from '#/lib/conventions/graph/snapshot'
export {collectiveGravity} from '#/lib/conventions/gravity/collective'
export {personalGravity} from '#/lib/conventions/gravity/personal'
export {
  DEFAULT_RANK_BLEND,
  DEFAULT_SIGNAL_POLICY,
  getSignalWeight,
} from '#/lib/conventions/policy'
export {
  type ConventionEngine,
  type ConventionEngineOptions,
  createConventionEngine,
  type ProcessResult,
  type RankCandidateInput,
  type RankCandidateResult,
} from '#/lib/conventions/processor'
export {
  applyConventionSignals,
  type ConventionRankingSignals,
  neutralRankingSignals,
} from '#/lib/conventions/ranking/signals'
export {
  BUILTIN_ALIASES,
  conventionId,
  createConventionRegistry,
} from '#/lib/conventions/registry'
export {measureSaturation} from '#/lib/conventions/saturation/engine'
export {createLocalConventionStore} from '#/lib/conventions/storage/local'
export {createMemoryConventionStore} from '#/lib/conventions/storage/memory'
export {type ConventionStore} from '#/lib/conventions/storage/types'
export {createMemorySynthesisRepository} from '#/lib/conventions/synthesis/repository'
export {
  type CollectiveConventionGraph,
  type Convention,
  CONVENTION_SCHEMA_VERSION,
  CONVENTION_TYPES,
  type ConventionEvidence,
  type ConventionFeedback,
  type ConventionGraphDiff,
  type ConventionGraphSnapshot,
  type ConventionSynapse,
  FUTURE_SENSITIVE_TYPES,
  type PersonalConventionGraph,
  type SemanticEvent,
  type Synthesis,
} from '#/lib/conventions/types'
export {
  emptyPersonalGraph,
  parseCollectiveGraph,
  parsePersonalGraph,
} from '#/lib/conventions/validate'
