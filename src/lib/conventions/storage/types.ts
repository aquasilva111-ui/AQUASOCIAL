import {
  type CollectiveConventionGraph,
  type Convention,
  type ConventionSynapse,
  type PersonalConventionGraph,
  type Synthesis,
} from '#/lib/conventions/types'

export type GraphReadResult =
  | {ok: true; graph: PersonalConventionGraph | null}
  | {ok: false; reason: string}

export type CollectiveReadResult =
  | {ok: true; graph: CollectiveConventionGraph | null}
  | {ok: false; reason: string}

/**
 * Persistence port. Personal graphs are not AT Protocol records and are
 * not written to the public synthesis base.
 */
export interface ConventionStore {
  getConvention(subjectId: string, id: string): Promise<Convention | null>
  putConvention(subjectId: string, convention: Convention): Promise<void>
  listConventions(subjectId: string): Promise<Convention[]>
  getGraph(subjectId: string): Promise<PersonalConventionGraph | null>
  readGraph(subjectId: string): Promise<GraphReadResult>
  saveGraph(graph: PersonalConventionGraph): Promise<void>
  getSynapses(subjectId: string): Promise<ConventionSynapse[]>
  saveSynapse(subjectId: string, synapse: ConventionSynapse): Promise<void>
  getSyntheses(subjectId: string): Promise<Synthesis[]>
  saveSynthesis(subjectId: string, synthesis: Synthesis): Promise<void>
  getCollective(scopeId: string): Promise<CollectiveConventionGraph | null>
  readCollective(scopeId: string): Promise<CollectiveReadResult>
  saveCollective(graph: CollectiveConventionGraph): Promise<void>
}

export type KeyValuePort = {
  get(key: string): string | null
  set(key: string, value: string): void
}
