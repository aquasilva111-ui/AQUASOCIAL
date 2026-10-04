/**
 * AQUA WIKI country statistics from three CC BY providers: World Bank,
 * Eurostat (EU countries only) and Our World in Data. Pure parsers.
 */
export type Provider = 'worldbank' | 'eurostat' | 'owid'
export type Point = {year: number; value: number}
export type Country = {
  iso3: string
  iso2: string
  name: string
  capital?: string
  region?: string
  income?: string
}
export type Indicator = {
  id: string
  label: string
  unit: string
  providers: Partial<Record<Provider, string>>
}

export const STATS_LICENSE = 'CC BY 4.0'
export const PROVIDER_NAMES: Record<Provider, string> = {
  worldbank: 'World Bank',
  eurostat: 'Eurostat',
  owid: 'Our World in Data',
}

export const INDICATORS: Indicator[] = [
  {
    id: 'population',
    label: 'População',
    unit: 'hab.',
    providers: {
      worldbank: 'SP.POP.TOTL',
      eurostat: 'demo_gind',
      owid: 'population',
    },
  },
  {
    id: 'life',
    label: 'Esperança de vida',
    unit: 'anos',
    providers: {worldbank: 'SP.DYN.LE00.IN', owid: 'life-expectancy'},
  },
  {
    id: 'gdppc',
    label: 'PIB per capita',
    unit: 'US$',
    providers: {worldbank: 'NY.GDP.PCAP.CD'},
  },
  {
    id: 'co2',
    label: 'CO₂ per capita',
    unit: 't',
    providers: {worldbank: 'EN.ATM.CO2E.PC'},
  },
]

/** ISO3 to ISO2 is needed by Eurostat; EU members only. */
const EU_GEO: Record<string, string> = {
  AUT: 'AT',
  BEL: 'BE',
  BGR: 'BG',
  HRV: 'HR',
  CYP: 'CY',
  CZE: 'CZ',
  DNK: 'DK',
  EST: 'EE',
  FIN: 'FI',
  FRA: 'FR',
  DEU: 'DE',
  GRC: 'EL',
  HUN: 'HU',
  IRL: 'IE',
  ITA: 'IT',
  LVA: 'LV',
  LTU: 'LT',
  LUX: 'LU',
  MLT: 'MT',
  NLD: 'NL',
  POL: 'PL',
  PRT: 'PT',
  ROU: 'RO',
  SVK: 'SK',
  SVN: 'SI',
  ESP: 'ES',
  SWE: 'SE',
}

export function providersFor(indicator: Indicator, iso3: string): Provider[] {
  return (Object.keys(indicator.providers) as Provider[]).filter(
    p => p !== 'eurostat' || iso3 in EU_GEO,
  )
}

const WB = 'https://api.worldbank.org/v2'
const code = (s: string) => encodeURIComponent(s.trim())

export const countriesUrl = () => `${WB}/country?format=json&per_page=300`
export const countryUrl = (iso3: string) =>
  `${WB}/country/${code(iso3)}?format=json`

export function seriesUrl(
  provider: Provider,
  indicator: Indicator,
  iso3: string,
) {
  const ref = indicator.providers[provider]
  if (!ref) throw new Error(`${indicator.id} not available on ${provider}`)
  if (provider === 'worldbank')
    return `${WB}/country/${code(iso3)}/indicator/${ref}?format=json&per_page=80`
  if (provider === 'eurostat') {
    const geo = EU_GEO[iso3]
    if (!geo) throw new Error(`${iso3} is not an EU country`)
    return `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${ref}?geo=${geo}&indic_de=JAN&format=JSON&lang=EN`
  }
  return `https://ourworldindata.org/grapher/${ref}.csv?v=1&csvType=filtered&useColumnShortNames=true&country=~${code(iso3)}`
}

const sortPoints = (pts: Point[]) => pts.sort((a, b) => a.year - b.year)

export function parseCountry(json: any): Country | undefined {
  const c = json?.[1]?.[0]
  return c?.id ? toCountry(c) : undefined
}

function toCountry(c: any): Country {
  return {
    iso3: String(c.id),
    iso2: String(c.iso2Code ?? ''),
    name: String(c.name),
    capital: c.capitalCity || undefined,
    region: c.region?.value?.trim() || undefined,
    income: c.incomeLevel?.value || undefined,
  }
}

/** Real countries only: World Bank also lists aggregates (region id "NA"). */
export function parseCountries(json: any): Country[] {
  const list = Array.isArray(json?.[1]) ? json[1] : []
  return list
    .filter((c: any) => c?.id && c.region?.id && c.region.id !== 'NA')
    .map(toCountry)
    .sort((a: Country, b: Country) => a.name.localeCompare(b.name))
}

export function parseWorldBank(json: any): Point[] {
  const rows = Array.isArray(json?.[1]) ? json[1] : []
  return sortPoints(
    rows
      .filter((r: any) => typeof r?.value === 'number')
      .map((r: any) => ({year: Number(r.date), value: r.value})),
  )
}

/** JSON-stat 2.0 with every non-time dimension of size 1. */
export function parseEurostat(json: any): Point[] {
  const index = json?.dimension?.time?.category?.index
  const values = json?.value
  if (!index || !values) return []
  return sortPoints(
    Object.entries(index)
      .filter(([, i]) => typeof values[i as number] === 'number')
      .map(([year, i]) => ({year: Number(year), value: values[i as number]})),
  )
}

export function parseOwid(csv: string): Point[] {
  const lines = String(csv ?? '')
    .trim()
    .split('\n')
    .slice(1)
  return sortPoints(
    lines
      .map(l => l.split(','))
      .map(c => ({year: Number(c[2]), value: Number(c[3])}))
      .filter(p => Number.isFinite(p.year) && Number.isFinite(p.value)),
  )
}

export function formatValue(value: number, unit: string): string {
  const abs = Math.abs(value)
  const text =
    abs >= 1e9
      ? `${(value / 1e9).toFixed(2)} mil M`
      : abs >= 1e6
        ? `${(value / 1e6).toFixed(1)} M`
        : abs >= 1e4
          ? Math.round(value).toLocaleString('pt-PT')
          : value.toFixed(abs < 100 ? 1 : 0)
  return `${text} ${unit}`
}
