/** Stable canonical keys. Display labels are never used as ids. */

export function canonicalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function canonicalKeyFromLabel(value: string): string {
  return canonicalizeLabel(value).replace(/ /g, '-')
}

export function includesPhrase(haystack: string, phrase: string): boolean {
  const text = canonicalizeLabel(haystack)
  const needle = canonicalizeLabel(phrase)
  if (!text || !needle) return false
  return ` ${text} `.includes(` ${needle} `)
}

const CREATOR_DID = /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]{1,200}$/

export function creatorKey(did: string): string | null {
  const trimmed = did.trim()
  if (!CREATOR_DID.test(trimmed)) return null
  return trimmed.toLowerCase()
}
