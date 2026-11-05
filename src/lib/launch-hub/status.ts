import {
  type DestinationStatus,
  type LaunchDestination,
  type LaunchStatus,
} from '#/lib/launch-hub/types'

/**
 * Launch Hub list tabs. `awaiting_user` is its own tab: after "Publicar em
 * todas" the automatic networks are done and the assisted ones still wait
 * for the person, so the launch must stay visible.
 */
export const LAUNCH_LIST_TABS: {
  id:
    | 'drafts'
    | 'scheduled'
    | 'publishing'
    | 'awaiting'
    | 'published'
    | 'failed'
  statuses: LaunchStatus[]
}[] = [
  {id: 'drafts', statuses: ['draft']},
  {id: 'scheduled', statuses: ['scheduled']},
  {id: 'publishing', statuses: ['publishing']},
  {id: 'awaiting', statuses: ['awaiting_user']},
  {id: 'published', statuses: ['published', 'partial']},
  {id: 'failed', statuses: ['failed', 'partial']},
]

export type LaunchListTabId = (typeof LAUNCH_LIST_TABS)[number]['id']

export function launchesForTab<T extends {status: LaunchStatus}>(
  launches: readonly T[],
  tabId: LaunchListTabId,
): T[] {
  const statuses =
    LAUNCH_LIST_TABS.find(tab => tab.id === tabId)?.statuses ?? []
  return launches.filter(launch => statuses.includes(launch.status))
}

/** Launch status from its destinations (pure; no adapters imported). */
export function deriveLaunchStatus(
  destinations: Pick<LaunchDestination, 'status' | 'mode'>[],
  fallback: LaunchStatus = 'draft',
): LaunchStatus {
  const count = (status: DestinationStatus) =>
    destinations.filter(d => d.status === status).length
  const total = destinations.length
  if (!total) return fallback
  // assisted destinations still waiting for the person (not a failure)
  const waiting = destinations.filter(
    d =>
      d.mode === 'assistido' &&
      (d.status === 'pending' || d.status === 'opened'),
  ).length
  if (count('processing')) return 'publishing'
  if (count('published') + count('skipped') === total) return 'published'
  if (count('failed') === total) return 'failed'
  if (count('failed')) return count('published') ? 'partial' : 'failed'
  if (count('scheduled')) return 'scheduled'
  if (waiting && waiting + count('published') + count('skipped') === total)
    return 'awaiting_user'
  if (count('published')) return 'partial'
  return fallback
}
