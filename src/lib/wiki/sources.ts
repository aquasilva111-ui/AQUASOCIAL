/**
 * Extra AQUA WIKI sources besides Wikipedia: NASA (images library + APOD) and
 * PubChem (molecules). Pure URL builders and parsers; I/O lives in `api.ts`.
 */
export type SourceEntry = {
  source: 'NASA' | 'PubChem'
  id: string
  title: string
  summary: string
  image?: string
  url: string
  license: string
  facts: [label: string, value: string][]
}

export const NASA_LICENSE = 'Domínio público (NASA)'
export const PUBCHEM_LICENSE = 'Domínio público (PubChem/NCBI)'
// DEMO_KEY is rate limited (30 requests/hour per IP); swap in a real key.
export const NASA_API_KEY = 'DEMO_KEY'

function clean(text: unknown, max = 500): string {
  const plain = String(text ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain
}

export function nasaSearchUrl(query: string, limit = 12): string {
  return `https://images-api.nasa.gov/search?q=${encodeURIComponent(
    query.trim(),
  )}&media_type=image&page_size=${limit}`
}

export const apodUrl = () =>
  `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`

export function parseNasaSearch(json: any): SourceEntry[] {
  const items = Array.isArray(json?.collection?.items)
    ? json.collection.items
    : []
  const out: SourceEntry[] = []
  for (const item of items) {
    const d = item?.data?.[0]
    if (!d?.nasa_id || !d?.title) continue
    const facts: SourceEntry['facts'] = []
    if (d.date_created)
      facts.push(['Data', String(d.date_created).slice(0, 10)])
    if (d.center) facts.push(['Centro', String(d.center)])
    out.push({
      source: 'NASA',
      id: String(d.nasa_id),
      title: clean(d.title, 120),
      summary: clean(d.description),
      image: item.links?.[0]?.href,
      url: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
      license: NASA_LICENSE,
      facts,
    })
  }
  return out
}

export function parseApod(json: any): SourceEntry | undefined {
  if (!json || typeof json.title !== 'string') return undefined
  const facts: SourceEntry['facts'] = []
  if (json.date) facts.push(['Data', String(json.date)])
  return {
    source: 'NASA',
    id: `apod-${json.date ?? ''}`,
    title: clean(json.title, 120),
    summary: clean(json.explanation, 800),
    image: json.media_type === 'image' ? json.url : undefined,
    url: 'https://apod.nasa.gov/apod/astropix.html',
    // Some APOD images belong to their authors, not NASA.
    license: json.copyright
      ? `© ${clean(json.copyright, 80)} (uso só com permissão)`
      : NASA_LICENSE,
    facts,
  }
}

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'

export function compoundPropsUrl(name: string): string {
  return `${PUG}/compound/name/${encodeURIComponent(
    name.trim(),
  )}/property/Title,MolecularFormula,MolecularWeight,IUPACName/JSON`
}

export const compoundDescriptionUrl = (cid: number | string) =>
  `${PUG}/compound/cid/${encodeURIComponent(String(cid))}/description/JSON`

export const compoundImageUrl = (cid: number | string) =>
  `${PUG}/compound/cid/${encodeURIComponent(String(cid))}/PNG`

export function parseCompound(props: any, desc?: any): SourceEntry | undefined {
  const p = props?.PropertyTable?.Properties?.[0]
  if (!p?.CID) return undefined
  const info = Array.isArray(desc?.InformationList?.Information)
    ? desc.InformationList.Information.find((i: any) => i?.Description)
    : undefined
  const facts: SourceEntry['facts'] = []
  if (p.MolecularFormula) facts.push(['Fórmula', String(p.MolecularFormula)])
  if (p.MolecularWeight)
    facts.push(['Massa molar', `${p.MolecularWeight} g/mol`])
  if (p.IUPACName) facts.push(['IUPAC', String(p.IUPACName)])
  return {
    source: 'PubChem',
    id: String(p.CID),
    title: clean(p.Title ?? p.IUPACName ?? `CID ${p.CID}`, 120),
    summary: clean(info?.Description),
    image: compoundImageUrl(p.CID),
    url: `https://pubchem.ncbi.nlm.nih.gov/compound/${encodeURIComponent(
      String(p.CID),
    )}`,
    license: PUBCHEM_LICENSE,
    facts,
  }
}
