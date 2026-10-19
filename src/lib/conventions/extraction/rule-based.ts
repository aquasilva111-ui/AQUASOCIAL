import {
  type SemanticExtractionInput,
  type SemanticExtractionResult,
  type SemanticExtractor,
  type SemanticHit,
} from '#/lib/conventions/extraction/types'
import {creatorKey, includesPhrase} from '#/lib/conventions/normalize'
import {
  isEmitableType,
  isForbiddenConventionLabel,
} from '#/lib/conventions/privacy'
import {
  conventionId,
  type ConventionRegistry,
  createConventionRegistry,
} from '#/lib/conventions/registry'
import {type ConventionType} from '#/lib/conventions/types'

const CREATOR_EVENTS = new Set(['follow', 'subscribe'])

function emptyResult(): SemanticExtractionResult {
  return {
    hits: [],
    topics: [],
    entities: [],
    concepts: [],
    activities: [],
    formats: [],
    contexts: [],
    creators: [],
    communities: [],
    values: [],
  }
}

function push(result: SemanticExtractionResult, hit: SemanticHit | null) {
  if (!hit || result.hits.some(item => item.id === hit.id)) return
  result.hits.push(hit)
  if (hit.type === 'topic') result.topics.push(hit)
  else if (hit.type === 'entity') result.entities.push(hit)
  else if (hit.type === 'concept') result.concepts.push(hit)
  else if (hit.type === 'activity') result.activities.push(hit)
  else if (hit.type === 'format') result.formats.push(hit)
  else if (hit.type === 'context') result.contexts.push(hit)
  else if (hit.type === 'creator') result.creators.push(hit)
  else if (hit.type === 'community') result.communities.push(hit)
  else if (hit.type === 'value') result.values.push(hit)
}

export function createRuleBasedExtractor(
  registry: ConventionRegistry = createConventionRegistry(),
  namespace = 'aqua',
): SemanticExtractor {
  function hitFromLabel(
    label: string,
    suggested: ConventionType,
    confidence: number,
  ): SemanticHit | null {
    if (isForbiddenConventionLabel(label)) return null
    if (!isEmitableType(suggested)) return null
    const resolved = registry.resolve(label, suggested)
    if (!resolved) return null
    if (isForbiddenConventionLabel(resolved.label)) return null
    if (isForbiddenConventionLabel(resolved.canonicalMeaning)) return null
    return {
      id: conventionId(namespace, resolved.type, resolved.canonicalMeaning),
      type: resolved.type,
      label: resolved.label,
      canonicalMeaning: resolved.canonicalMeaning,
      aliases: resolved.aliases,
      confidence,
    }
  }

  return {
    extract(input: SemanticExtractionInput) {
      const result = emptyResult()
      const prose = [input.title, input.description, input.text]
        .filter(
          (part): part is string =>
            typeof part === 'string' && part.trim().length > 0,
        )
        .join(' ')
      if (prose) {
        for (const entry of registry.phraseRules) {
          if (!includesPhrase(prose, entry.phrase)) continue
          push(result, hitFromLabel(entry.rule.label, entry.rule.type, 0.72))
        }
      }
      const tokens = [
        ...(input.tags ?? []),
        ...(input.hashtags ?? []),
        ...(input.categories ?? []),
        ...(input.facets ?? []).map(facet => facet.tag ?? ''),
        ...(input.linkedEntities ?? []),
      ]
      const lexicon = input.lexicon ?? {}
      for (const value of Object.values(lexicon)) {
        if (typeof value === 'string') tokens.push(value)
        else if (Array.isArray(value)) tokens.push(...value)
      }
      for (const token of tokens) {
        if (typeof token !== 'string') continue
        const suggested = (input.linkedEntities ?? []).includes(token)
          ? 'entity'
          : 'topic'
        push(result, hitFromLabel(token, suggested, 0.64))
      }
      if (input.contentType) {
        push(result, hitFromLabel(input.contentType, 'format', 0.4))
      }
      if (input.creatorDid && CREATOR_EVENTS.has(input.eventType ?? '')) {
        const key = creatorKey(input.creatorDid)
        if (key && !isForbiddenConventionLabel(input.creatorLabel ?? key)) {
          push(result, {
            id: conventionId(namespace, 'creator', key),
            type: 'creator',
            label: (input.creatorLabel ?? key).slice(0, 120),
            canonicalMeaning: key,
            aliases: [input.creatorLabel ?? key],
            confidence: 0.8,
          })
        }
      }
      return Promise.resolve(result)
    },
  }
}
