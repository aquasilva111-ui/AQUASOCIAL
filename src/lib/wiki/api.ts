import {
  parseSearch,
  parseSummary,
  searchUrl,
  summaryUrl,
  type WikiEntry,
  type WikiSearchHit,
} from '#/lib/wiki/model'
import {isWeb} from '#/platform/detection'

// Wikimedia asks for an identifiable agent. Browsers forbid setting
// User-Agent, so on web we use the Api-User-Agent header instead.
const headers: Record<string, string> = isWeb
  ? {}
  : {'Api-User-Agent': 'AquaSocial/1.0 (https://aquaapp.online)'}

async function getJson(url: string, signal?: AbortSignal) {
  const res = await fetch(url, {headers, signal})
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  return res.json()
}

export async function fetchEntry(
  lang: string,
  title: string,
  signal?: AbortSignal,
): Promise<WikiEntry | undefined> {
  return parseSummary(lang, await getJson(summaryUrl(lang, title), signal))
}

export async function searchEntries(
  lang: string,
  query: string,
  signal?: AbortSignal,
): Promise<WikiSearchHit[]> {
  return parseSearch(await getJson(searchUrl(lang, query), signal))
}
