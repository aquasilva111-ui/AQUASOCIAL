import {
  canonicalizeLabel,
  canonicalKeyFromLabel,
} from '#/lib/conventions/normalize'
import {type ConventionType} from '#/lib/conventions/types'

export type AliasRule = {
  phrases: string[]
  canonicalKey: string
  label: string
  type: ConventionType
}

export const BUILTIN_ALIASES: AliasRule[] = [
  {
    phrases: [
      'open source',
      'open-source',
      'opensource',
      'software livre',
      'software livre/open source',
      'software livre open source',
    ],
    canonicalKey: 'open-source',
    label: 'open source',
    type: 'concept',
  },
  {
    phrases: [
      'music production',
      'music-production',
      'producao musical',
      'produção musical',
    ],
    canonicalKey: 'music-production',
    label: 'music production',
    type: 'topic',
  },
  {
    phrases: ['midi'],
    canonicalKey: 'midi',
    label: 'MIDI',
    type: 'entity',
  },
  {
    phrases: ['ableton'],
    canonicalKey: 'ableton',
    label: 'Ableton',
    type: 'entity',
  },
]

export type ResolvedConvention = {
  type: ConventionType
  canonicalMeaning: string
  label: string
  aliases: string[]
}

export type ConventionRegistry = {
  resolve: (
    label: string,
    suggestedType?: ConventionType,
  ) => ResolvedConvention | null
  phraseRules: Array<{phrase: string; rule: AliasRule}>
}

export function conventionId(
  namespace: string,
  type: ConventionType,
  canonicalMeaning: string,
): string {
  return `${namespace}:${type}:${canonicalMeaning}`
}

export function createConventionRegistry(
  extra: AliasRule[] = [],
): ConventionRegistry {
  const rules = [...BUILTIN_ALIASES, ...extra]
  const byPhrase = new Map<string, AliasRule>()
  for (const rule of rules) {
    byPhrase.set(canonicalizeLabel(rule.label), rule)
    byPhrase.set(canonicalizeLabel(rule.canonicalKey.replace(/-/g, ' ')), rule)
    for (const phrase of rule.phrases) {
      byPhrase.set(canonicalizeLabel(phrase), rule)
    }
  }
  const phraseRules = rules
    .flatMap(rule =>
      rule.phrases.map(phrase => ({
        phrase: canonicalizeLabel(phrase),
        rule,
      })),
    )
    .filter(entry => entry.phrase.length >= 3)
    .sort((a, b) => b.phrase.length - a.phrase.length)

  return {
    phraseRules,
    resolve(label, suggestedType) {
      const canonical = canonicalizeLabel(label)
      if (!canonical || canonical.length > 80) return null
      const rule = byPhrase.get(canonical)
      if (rule) {
        return {
          type: rule.type,
          canonicalMeaning: rule.canonicalKey,
          label: rule.label,
          aliases: [label.trim()],
        }
      }
      const key = canonicalKeyFromLabel(label)
      if (!key || key.length > 80) return null
      return {
        type: suggestedType ?? 'topic',
        canonicalMeaning: key,
        label: label.trim().slice(0, 120),
        aliases: [label.trim().slice(0, 120)],
      }
    },
  }
}
