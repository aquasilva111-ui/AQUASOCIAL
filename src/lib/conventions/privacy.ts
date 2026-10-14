import {canonicalizeLabel} from '#/lib/conventions/normalize'
import {
  type ConventionType,
  FUTURE_SENSITIVE_TYPES,
} from '#/lib/conventions/types'

/**
 * Drops labels that would turn ordinary behavior into an identity,
 * diagnosis, or precise personal identifier. Content topics stay allowed.
 */

const IDENTITY_PHRASES = [
  'left-wing user',
  'right-wing user',
  'left wing user',
  'right wing user',
  'conservative user',
  'liberal user',
  'communist user',
  'comunista',
  'depressed user',
  'usuario deprimido',
  'gay user',
  'christian user',
  'usuario cristao',
  'anxious person',
  'has anxiety',
  'tem ansiedade',
  'sexual orientation',
  'orientacao sexual',
  'diagnosed with',
  'diagnosticado com',
  'diagnosticada com',
  'has depression',
  'sofre de',
]

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PHONE = /\+?\d[\d\s().-]{8,}\d/
const LAT_LONG = /-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/

export function isForbiddenConventionLabel(label: string): boolean {
  const canonical = canonicalizeLabel(label)
  if (!canonical) return true
  if (EMAIL.test(label) || PHONE.test(label) || LAT_LONG.test(label))
    return true
  return IDENTITY_PHRASES.some(phrase => canonical.includes(phrase))
}

export function isEmitableType(type: string): type is ConventionType {
  return !(FUTURE_SENSITIVE_TYPES as readonly string[]).includes(type)
}
