import * as Y from 'yjs'

import { DOCS_FRAGMENT } from '../adapters/docs'

export interface Heading {
  level: number
  text: string
}

export interface DocStats {
  words: number
  chars: number
  charsNoSpaces: number
  sentences: number
  paragraphs: number
  headings: Heading[]
  bullets: number
  numbered: number
  checks: { done: number; total: number }
  images: number
  tables: number
  codeBlocks: number
  quotes: number
  /** Minutes at 200 words/min (silent reading) and 130 words/min (speaking). */
  readingMin: number
  speakingMin: number
  avgSentenceWords: number
  longestSentenceWords: number
  avgWordLength: number
  /** Distinct words / all words, 0..1 (lexical variety). */
  uniqueRatio: number
  /** Flesch reading ease adapted to Portuguese (Martins et al., 1996); approximate (syllables are estimated). */
  fleschPt: number
  readingLevel: 'muito fácil' | 'fácil' | 'difícil' | 'muito difícil' | '—'
  keywords: { word: string; count: number }[]
}

const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'quote', 'codeBlock', 'tableParagraph'])
const COUNT_ONLY = new Set(['image', 'video', 'audio', 'file', 'table'])

const STOP = new Set(
  ('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre e ou mas que se como mais menos muito muita já não sim ao aos à às é são foi ser ter tem há ' +
    'isso isto esse essa este esta aquele aquela seu sua seus suas meu minha eu você ele ela nós eles elas me te lhe lhes também quando onde porque pois até entre depois antes ' +
    'the and for are but not you all any can had her was one our out has have this that with from they will what when your how its into than then them these those their there ' +
    'been were which would about more some other just also very').split(' ')
)

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu

function syllables(word: string): number {
  const groups = word.toLowerCase().match(/[aeiouáéíóúâêôãõàü]+/g)
  return Math.max(1, groups ? groups.length : 1)
}

/**
 * Statistics of a document from its Yjs XML (`fragment.toString()`). Pure and synchronous, so it is
 * the same in the editor, in tests and for any past version.
 */
export function docStatsFromXml(xml: string): DocStats {
  const stack: { type: string; attrs: string; text: string }[] = []
  const blocks: { type: string; attrs: string; text: string }[] = []
  let images = 0
  let tables = 0
  const re = /<(\/?)([A-Za-z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[5] !== undefined) {
      if (stack.length) stack[stack.length - 1].text += decode(m[5])
      continue
    }
    const [, closing, tag, attrs, selfClose] = m
    if (!closing) {
      if (TEXT_BLOCKS.has(tag)) {
        const b = { type: tag, attrs, text: '' }
        if (selfClose) blocks.push(b)
        else stack.push(b)
      } else if (COUNT_ONLY.has(tag)) {
        if (tag === 'table') tables++
        else if (tag === 'image') images++
      }
    } else if (TEXT_BLOCKS.has(tag) && stack.length) {
      blocks.push(stack.pop()!)
    }
  }

  const prose = blocks.filter((b) => b.type !== 'codeBlock')
  const allText = prose.map((b) => b.text).join('\n')
  const words = allText.match(WORD) ?? []
  const lower = words.map((w) => w.toLowerCase())
  const sentenceList = prose
    .filter((b) => b.type === 'paragraph' || b.type === 'quote') // headings and list items are not sentences
    .flatMap((b) => b.text.split(/[.!?…]+(?:\s+|$)/))
    .map((s) => (s.match(WORD) ?? []).length)
    .filter((n) => n > 0)
  const sentences = sentenceList.length
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  const avgSentenceWords = sentences ? sentenceList.reduce((n, w) => n + w, 0) / sentences : 0
  const fleschPt = words.length && sentences ? 248.835 - 1.015 * avgSentenceWords - 84.6 * (syl / words.length) : 0
  const level: DocStats['readingLevel'] = !words.length || !sentences ? '—' : fleschPt >= 75 ? 'muito fácil' : fleschPt >= 50 ? 'fácil' : fleschPt >= 25 ? 'difícil' : 'muito difícil'

  const freq = new Map<string, number>()
  for (const w of lower) if (w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)) freq.set(w, (freq.get(w) ?? 0) + 1)
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }))

  const checkBlocks = blocks.filter((b) => b.type === 'checkListItem')
  return {
    words: words.length,
    chars: allText.replace(/\n/g, ' ').length,
    charsNoSpaces: allText.replace(/\s/g, '').length,
    sentences,
    paragraphs: blocks.filter((b) => b.type === 'paragraph' && b.text.trim()).length,
    headings: blocks.filter((b) => b.type === 'heading' && b.text.trim()).map((b) => ({ level: +(/level="(\d)"/.exec(b.attrs)?.[1] ?? 1), text: b.text.trim() })),
    bullets: blocks.filter((b) => b.type === 'bulletListItem').length,
    numbered: blocks.filter((b) => b.type === 'numberedListItem').length,
    checks: { done: checkBlocks.filter((b) => /checked="true"/.test(b.attrs)).length, total: checkBlocks.length },
    images,
    tables,
    codeBlocks: blocks.filter((b) => b.type === 'codeBlock').length,
    quotes: blocks.filter((b) => b.type === 'quote').length,
    readingMin: words.length / 200,
    speakingMin: words.length / 130,
    avgSentenceWords,
    longestSentenceWords: sentenceList.reduce((m, n) => Math.max(m, n), 0),
    avgWordLength: words.length ? words.reduce((n, w) => n + w.length, 0) / words.length : 0,
    uniqueRatio: words.length ? new Set(lower).size / words.length : 0,
    fleschPt,
    readingLevel: level,
    keywords
  }
}

export const docStats = (fragment: Y.XmlFragment): DocStats => docStatsFromXml(fragment.toString())

/** Statistics of a stored version (the bytes `docsAdapter` serialises). */
export function docStatsFromBytes(bytes: Uint8Array): DocStats {
  const doc = new Y.Doc()
  try {
    Y.applyUpdate(doc, bytes)
    return docStats(doc.getXmlFragment(DOCS_FRAGMENT))
  } finally {
    doc.destroy()
  }
}

export interface VersionPoint {
  at: string
  words: number
  /** Words added (+) or removed (-) compared with the previous version. */
  delta: number
  message: string
}

/** Word count over time, oldest first; `delta` against the previous point. */
export function wordSeries(points: { at: string; message: string; words: number }[]): VersionPoint[] {
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at))
  return sorted.map((p, i) => ({ ...p, delta: p.words - (sorted[i - 1]?.words ?? 0) }))
}

/**
 * Editing sessions from save times: saves closer than `gapMin` minutes belong to one session. `activeMin`
 * is the sum of the gaps inside sessions (an estimate of time spent writing, not a measurement).
 */
export function editSessions(times: string[], gapMin = 30): { sessions: number; activeMin: number; first?: string; last?: string } {
  const t = times.map((x) => Date.parse(x)).filter(Number.isFinite).sort((a, b) => a - b)
  if (!t.length) return { sessions: 0, activeMin: 0 }
  let sessions = 1
  let active = 0
  for (let i = 1; i < t.length; i++) {
    const gap = (t[i] - t[i - 1]) / 60000
    if (gap > gapMin) sessions++
    else active += gap
  }
  return { sessions, activeMin: active, first: new Date(t[0]).toISOString(), last: new Date(t[t.length - 1]).toISOString() }
}
