import {type Queryable} from '../db/index.js'
import {audit} from '../lib/audit.js'
import {registerScanHook} from '../media/engine.js'
import {openCase} from './moderation.js'

/**
 * Seam for EXTERNAL detection / hash-matching services (industry hash lists,
 * provider classifiers). AQUA ships no home-made detector of illegal
 * material: without a registered provider nothing is flagged here.
 */
export type MatchResult = {
  matched: boolean
  /** Provider's own opaque reference for the match (never the media). */
  reference?: string
  category?: string
}

export interface MatchingProvider {
  readonly name: string
  check(
    asset: {id: string; kind: string},
    filePath: string,
  ): Promise<MatchResult>
}

const providers: MatchingProvider[] = []

export function registerMatchingProvider(p: MatchingProvider): () => void {
  providers.push(p)
  return () => {
    const i = providers.indexOf(p)
    if (i >= 0) providers.splice(i, 1)
  }
}

/**
 * Wires registered providers into the Media Engine's scan step for this
 * database: a match quarantines the asset (engine) and opens a priority-1
 * case with the provider reference. Provider errors fail closed.
 */
export function installMatching(db: Queryable) {
  return registerScanHook(async (asset, filePath) => {
    const [mine] = await db.query(`select 1 from media_assets where id = $1`, [
      asset.id,
    ])
    if (!mine || !providers.length) return 'ok'
    for (const provider of providers) {
      let result: MatchResult
      try {
        result = await provider.check(asset, filePath)
      } catch {
        result = {matched: true, reference: `${provider.name}:error`}
      }
      if (!result.matched) continue
      const caseId = await openCase(db, {
        source: 'hash_match',
        resourceType: 'media',
        resourceId: asset.id,
        reasonCode: result.category ?? null,
        priority: 1,
        status: 'ACTION_REQUIRED',
      })
      await audit(db, {
        actor: null,
        action: 'matching.quarantine',
        resourceType: 'media',
        resourceId: asset.id,
        reason: `${caseId}: ${provider.name}:${result.reference ?? ''}`.slice(
          0,
          500,
        ),
        result: 'ok',
      })
      return 'quarantine'
    }
    return 'ok'
  })
}
