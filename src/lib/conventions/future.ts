/**
 * Names of integrations that are intentionally not implemented.
 * These are markers, not working clients.
 */
export const PENDING_INTEGRATIONS = {
  'AQUA-052':
    'Personal Semantic Git is not implemented. Snapshots and diffs are the prepared model.',
  'AQUA-053': 'Convention ads are not implemented and are not a dependency.',
  'AQUA-054': 'Royalty profiles are not implemented and are not a dependency.',
  'AQUA-055':
    '616 provenance is not implemented. Personal graphs, views, and searches must not be written on a chain.',
} as const

export type PendingIntegration = keyof typeof PENDING_INTEGRATIONS

/** AQUA-052 will commit snapshots later. This version only builds them. */
export type PersonalSemanticGitCommit = {
  readonly pending: 'AQUA-052'
}

/** AQUA-055. No method accepts a personal graph. */
export type ProvenanceBridge = {
  readonly pending: 'AQUA-055'
}
