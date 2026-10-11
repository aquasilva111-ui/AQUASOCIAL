import {
  type DestinationStatus,
  type LaunchDestination,
  type LaunchStatus,
} from '#/lib/launch-hub/types'

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
