import {type ConventionType} from '#/lib/conventions/types'

export type SemanticHit = {
  id: string
  type: ConventionType
  label: string
  canonicalMeaning: string
  aliases: string[]
  confidence: number
}

export type SemanticExtractionInput = {
  title?: string
  description?: string
  text?: string
  tags?: string[]
  hashtags?: string[]
  categories?: string[]
  contentType?: string
  creatorDid?: string
  creatorLabel?: string
  linkedEntities?: string[]
  facets?: Array<{tag?: string}>
  lexicon?: Record<string, string | string[] | undefined>
  eventType?: string
}

export type SemanticExtractionResult = {
  hits: SemanticHit[]
  topics: SemanticHit[]
  entities: SemanticHit[]
  concepts: SemanticHit[]
  activities: SemanticHit[]
  formats: SemanticHit[]
  contexts: SemanticHit[]
  creators: SemanticHit[]
  communities: SemanticHit[]
  values: SemanticHit[]
}

export interface SemanticExtractor {
  extract(input: SemanticExtractionInput): Promise<SemanticExtractionResult>
}
