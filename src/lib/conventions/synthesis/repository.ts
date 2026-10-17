import {type Synthesis} from '#/lib/conventions/types'

/**
 * Contract for a future synthesis base. The memory adapter is local to the
 * process. It does not write `base-de-sinteses/` and it is not a network.
 */
export interface SynthesisRepository {
  put(synthesis: Synthesis): Promise<void>
  get(id: string): Promise<Synthesis | null>
  search(query: {
    conventionId?: string
    subjectId?: string
  }): Promise<Synthesis[]>
  versions(id: string): Promise<Synthesis[]>
}

export function createMemorySynthesisRepository(): SynthesisRepository {
  const current = new Map<string, Synthesis>()
  const history = new Map<string, Synthesis[]>()

  return {
    async put(synthesis) {
      const previous = history.get(synthesis.id) ?? []
      const existing = current.get(synthesis.id)
      if (existing) previous.push(existing)
      history.set(synthesis.id, previous.slice(-20))
      current.set(synthesis.id, synthesis)
    },
    async get(id) {
      return current.get(id) ?? null
    },
    async search(query) {
      return [...current.values()].filter(synthesis => {
        if (query.subjectId && synthesis.subjectId !== query.subjectId)
          return false
        if (
          query.conventionId &&
          !synthesis.conventionIds.includes(query.conventionId)
        )
          return false
        return true
      })
    },
    async versions(id) {
      const previous = history.get(id) ?? []
      const latest = current.get(id)
      return latest ? [...previous, latest] : previous
    },
  }
}
