import {
  parseSearch,
  parseSummary,
  searchUrl,
  summaryUrl,
  type WikiEntry,
  type WikiSearchHit,
} from '#/lib/wiki/model'
import {
  apodUrl,
  compoundDescriptionUrl,
  compoundPropsUrl,
  nasaSearchUrl,
  parseApod,
  parseCompound,
  parseNasaSearch,
  type SourceEntry,
} from '#/lib/wiki/sources'
import {
  countriesUrl,
  type Country,
  countryUrl,
  type Indicator,
  parseCountries,
  parseCountry,
  parseEurostat,
  parseOwid,
  parseWorldBank,
  type Point,
  type Provider,
  seriesUrl,
} from '#/lib/wiki/stats'
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

export async function searchNasa(
  query: string,
  signal?: AbortSignal,
): Promise<SourceEntry[]> {
  return parseNasaSearch(await getJson(nasaSearchUrl(query), signal))
}

export async function fetchApod(
  signal?: AbortSignal,
): Promise<SourceEntry | undefined> {
  return parseApod(await getJson(apodUrl(), signal))
}

export async function fetchCompound(
  name: string,
  signal?: AbortSignal,
): Promise<SourceEntry | undefined> {
  const props = await getJson(compoundPropsUrl(name), signal)
  const cid = props?.PropertyTable?.Properties?.[0]?.CID
  if (!cid) return undefined
  const desc = await getJson(compoundDescriptionUrl(cid), signal).catch(
    () => undefined,
  )
  return parseCompound(props, desc)
}

export async function searchCountries(
  signal?: AbortSignal,
): Promise<Country[]> {
  return parseCountries(await getJson(countriesUrl(), signal))
}

export async function fetchCountry(
  iso3: string,
  signal?: AbortSignal,
): Promise<Country | undefined> {
  return parseCountry(await getJson(countryUrl(iso3), signal))
}

export async function fetchSeries(
  provider: Provider,
  indicator: Indicator,
  iso3: string,
  signal?: AbortSignal,
): Promise<Point[]> {
  const url = seriesUrl(provider, indicator, iso3)
  if (provider === 'owid') {
    const res = await fetch(url, {headers, signal})
    return res.ok ? parseOwid(await res.text()) : []
  }
  const json = await getJson(url, signal)
  return provider === 'eurostat' ? parseEurostat(json) : parseWorldBank(json)
}
