// Post → chaves de Convenção. Determinístico e simples: formato, criador,
// hashtags (tags + facets), idioma e rótulos. Palavras do texto casam com as
// Convenções "tema:" do próprio usuário na hora do ranking (score.ts).
import type {ConventionKey} from './model.ts'

export type MediaType = 'text' | 'image' | 'video' | 'link' | 'quote'

/** "#Música" → "musica": sem #, sem acento, minúsculas, espaços viram "-". */
export function normalizeTag(tag: string): string {
  return tag
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/^#+/, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
}

/** Texto para busca de palavras: sem acento, minúsculas, só letras/números. */
export function normalizeText(text: string, max = 600): string {
  return text
    .slice(0, max * 2)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#]+/gu, ' ')
    .trim()
    .slice(0, max)
}

/** Hashtags do registro (campo tags e facets #tag), sem repetição, na ordem. */
export function tagsFromRecord(record: {
  tags?: unknown
  facets?: unknown
}): string[] {
  const out: string[] = []
  const push = (t: unknown) => {
    if (typeof t !== 'string') return
    const n = normalizeTag(t)
    if (n && n.length <= 64 && !out.includes(n)) out.push(n)
  }
  if (Array.isArray(record.tags)) record.tags.forEach(push)
  if (Array.isArray(record.facets))
    for (const f of record.facets as Array<{features?: unknown}>)
      if (Array.isArray(f?.features))
        for (const feat of f.features as Array<{$type?: string; tag?: unknown}>)
          if (feat?.$type === 'app.bsky.richtext.facet#tag') push(feat.tag)
  return out.slice(0, 12)
}

/** Formato a partir do embed do post. */
export function mediaTypeOf(record: {embed?: {$type?: string}}): MediaType {
  const t = record.embed?.$type ?? ''
  if (t.includes('video')) return 'video'
  if (t.includes('images')) return 'image'
  if (t.includes('recordWithMedia')) return 'quote'
  if (t.includes('external')) return 'link'
  if (t.includes('record')) return 'quote'
  return 'text'
}

/** Um post ativa várias Convenções ao mesmo tempo. */
export function conventionKeys(p: {
  author: string
  mediaType: MediaType
  tags?: string[]
  lang?: string
  labels?: string[]
}): ConventionKey[] {
  const keys: ConventionKey[] = [`formato:${p.mediaType}`, `criador:${p.author}`]
  for (const t of p.tags ?? []) keys.push(`tema:${normalizeTag(t)}`)
  if (p.lang) keys.push(`idioma:${p.lang.toLowerCase().split('-')[0]}`)
  for (const l of p.labels ?? []) keys.push(`rotulo:${normalizeTag(l)}`)
  return [...new Set(keys)]
}

export type Context = 'madrugada' | 'manha' | 'tarde' | 'noite'

/** Faixa do dia (UTC por padrão; offset em minutos para o fuso do usuário). */
export function contextOf(iso: string, offsetMinutes = 0): Context {
  const h = new Date(Date.parse(iso) + offsetMinutes * 60_000).getUTCHours()
  if (h < 6) return 'madrugada'
  if (h < 12) return 'manha'
  if (h < 18) return 'tarde'
  return 'noite'
}
