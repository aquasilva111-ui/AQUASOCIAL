/**
 * AQUA WIKI model: Wikipedia languages and the normalised entry the UI renders.
 * Pure (no I/O) so it can be unit-tested; see `api.ts` for the network layer.
 */
export type WikiLang = {code: string; name: string; rtl?: boolean}

export const WIKI_LANGUAGES: WikiLang[] = [
  {code: 'pt', name: 'Português'},
  {code: 'en', name: 'English'},
  {code: 'es', name: 'Español'},
  {code: 'fr', name: 'Français'},
  {code: 'de', name: 'Deutsch'},
  {code: 'it', name: 'Italiano'},
  {code: 'nl', name: 'Nederlands'},
  {code: 'pl', name: 'Polski'},
  {code: 'sv', name: 'Svenska'},
  {code: 'no', name: 'Norsk'},
  {code: 'da', name: 'Dansk'},
  {code: 'fi', name: 'Suomi'},
  {code: 'cs', name: 'Čeština'},
  {code: 'ro', name: 'Română'},
  {code: 'hu', name: 'Magyar'},
  {code: 'el', name: 'Ελληνικά'},
  {code: 'uk', name: 'Українська'},
  {code: 'ru', name: 'Русский'},
  {code: 'tr', name: 'Türkçe'},
  {code: 'ar', name: 'العربية', rtl: true},
  {code: 'fa', name: 'فارسی', rtl: true},
  {code: 'he', name: 'עברית', rtl: true},
  {code: 'hi', name: 'हिन्दी'},
  {code: 'bn', name: 'বাংলা'},
  {code: 'ta', name: 'தமிழ்'},
  {code: 'th', name: 'ไทย'},
  {code: 'vi', name: 'Tiếng Việt'},
  {code: 'id', name: 'Indonesia'},
  {code: 'ms', name: 'Melayu'},
  {code: 'zh', name: '中文'},
  {code: 'ja', name: '日本語'},
  {code: 'ko', name: '한국어'},
  {code: 'sw', name: 'Kiswahili'},
  {code: 'af', name: 'Afrikaans'},
  {code: 'ca', name: 'Català'},
  {code: 'la', name: 'Latina'},
]

export const DEFAULT_WIKI_LANG = 'pt'
export const WIKI_LICENSE = 'CC BY-SA 4.0'

export type WikiEntry = {
  lang: string
  title: string
  summary: string
  image?: string
  url: string
  wikidataId?: string
  source: 'Wikipedia'
  license: typeof WIKI_LICENSE
}

export type WikiSearchHit = {
  title: string
  description?: string
  image?: string
}

export function findLang(code: string): WikiLang | undefined {
  return WIKI_LANGUAGES.find(l => l.code === code)
}

export function isRtl(code: string): boolean {
  return !!findLang(code)?.rtl
}

/** Only known codes become hostnames, so user input can never pick the host. */
function host(lang: string): string {
  const known = findLang(lang)
  if (!known) throw new Error(`Unsupported wiki language: ${lang}`)
  return `https://${known.code}.wikipedia.org`
}

export function summaryUrl(lang: string, title: string): string {
  return `${host(lang)}/api/rest_v1/page/summary/${encodeURIComponent(
    title.trim().replace(/\s+/g, '_'),
  )}`
}

export function searchUrl(lang: string, query: string, limit = 8): string {
  return `${host(lang)}/w/rest.php/v1/search/title?q=${encodeURIComponent(
    query.trim(),
  )}&limit=${limit}`
}

export function articleUrl(lang: string, title: string): string {
  return `${host(lang)}/wiki/${encodeURIComponent(
    title.trim().replace(/\s+/g, '_'),
  )}`
}

export function parseSummary(lang: string, json: any): WikiEntry | undefined {
  if (
    !json ||
    typeof json.title !== 'string' ||
    json.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found'
  ) {
    return undefined
  }
  return {
    lang,
    title: json.title,
    summary: typeof json.extract === 'string' ? json.extract : '',
    image: json.thumbnail?.source,
    url: json.content_urls?.desktop?.page ?? articleUrl(lang, json.title),
    wikidataId: json.wikibase_item,
    source: 'Wikipedia',
    license: WIKI_LICENSE,
  }
}

export function parseSearch(json: any): WikiSearchHit[] {
  const pages = Array.isArray(json?.pages) ? json.pages : []
  return pages
    .filter((p: any) => typeof p?.title === 'string')
    .map((p: any) => ({
      title: p.title,
      description: p.description ?? undefined,
      image: p.thumbnail?.url
        ? String(p.thumbnail.url).replace(/^\/\//, 'https://')
        : undefined,
    }))
}
