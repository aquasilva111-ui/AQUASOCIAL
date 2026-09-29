import {type AdapterContext, getAdapter} from '#/lib/launch-hub/adapters'
import {getProvider} from '#/lib/launch-hub/providers'
import {
  type DestinationStatus,
  type Launch,
  type LaunchDestination,
  type LaunchStatus,
  type ManagedProfile,
} from '#/lib/launch-hub/types'
import {validateDestination} from '#/lib/launch-hub/validation'
import {cleanError} from '#/lib/strings/errors'

/** A client-run job older than this can't still be in flight. */
const STALE_PROCESSING_MS = 2 * 60 * 1000

export function deriveLaunchStatus(
  destinations: Pick<LaunchDestination, 'status'>[],
  fallback: LaunchStatus = 'draft',
): LaunchStatus {
  const count = (status: DestinationStatus) =>
    destinations.filter(d => d.status === status).length
  const total = destinations.length
  if (!total) return fallback
  if (count('processing')) return 'publishing'
  if (count('published') + count('skipped') === total) return 'published'
  if (count('failed') === total) return 'failed'
  if (count('failed')) return count('published') ? 'partial' : 'failed'
  if (count('scheduled')) return 'scheduled'
  if (count('published')) return 'partial'
  return fallback
}

/**
 * Client-run jobs die with the tab. A destination left in `processing` long
 * after it started is marked failed so it can be retried — the retry is
 * idempotent, so a post that did land is found instead of duplicated.
 */
export function recoverStaleLaunch(launch: Launch, now = Date.now()): Launch {
  let changed = false
  const destinations = launch.destinations.map(d => {
    if (
      d.status === 'processing' &&
      // server-queued jobs keep running without the tab
      getProvider(d.provider).adapter !== 'integration-api' &&
      now - Date.parse(d.updatedAt) > STALE_PROCESSING_MS
    ) {
      changed = true
      return {
        ...d,
        status: 'failed' as const,
        error:
          'Interrompido antes de confirmar. Tente de novo; não duplica o post.',
      }
    }
    return d
  })
  if (!changed) return launch
  return {...launch, destinations, status: deriveLaunchStatus(destinations)}
}

export type LaunchUpdater = (update: (launch: Launch) => Launch) => void

/**
 * Runs each selected destination as an independent job: one failure never
 * stops or rolls back the others.
 */
export async function runDestinations({
  launch,
  destinationIds,
  profiles,
  ctx,
  update,
}: {
  launch: Launch
  destinationIds: string[]
  profiles: ManagedProfile[]
  ctx: AdapterContext
  update: LaunchUpdater
}) {
  const patch = (id: string, changes: Partial<LaunchDestination>) =>
    update(current => {
      const destinations = current.destinations.map(d =>
        d.id === id
          ? {...d, ...changes, updatedAt: new Date().toISOString()}
          : d,
      )
      return {
        ...current,
        destinations,
        status: deriveLaunchStatus(destinations, current.status),
        updatedAt: new Date().toISOString(),
      }
    })

  for (const destination of launch.destinations) {
    if (!destinationIds.includes(destination.id)) continue
    const profile = profiles.find(p => p.key === destination.profileKey)
    const validation = validateDestination({
      type: launch.type,
      content: launch.contentPackage,
      destination,
      profile,
    })
    if (!profile || validation.level === 'blocked') {
      patch(destination.id, {
        status: 'failed',
        error: validation.issues[0]?.message ?? 'Destino bloqueado.',
      })
      continue
    }

    patch(destination.id, {
      status: 'processing',
      error: undefined,
      attempts: destination.attempts + 1,
    })
    try {
      const result = await getAdapter(destination.provider).publish(
        {launch, destination, profile},
        ctx,
      )
      patch(
        destination.id,
        result.queued
          ? {status: 'processing'}
          : {
              status: 'published',
              remotePostId: result.remotePostId,
              remoteUrl: result.remoteUrl,
            },
      )
    } catch (e) {
      patch(destination.id, {status: 'failed', error: cleanError(e)})
    }
  }
}
