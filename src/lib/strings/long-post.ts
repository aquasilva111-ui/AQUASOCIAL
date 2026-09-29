import {
  type AppBskyRichtextFacet,
  type RichText,
  UnicodeString,
} from '@atproto/api'
import Graphemer from 'graphemer'

/**
 * `app.bsky.feed.post#text` is capped at 300 graphemes by the lexicon, and
 * PDSes reject longer records. AQUA allows longer posts by writing a preview
 * that fits into `text` and the full body into an extra field. Lexicon
 * objects are open, so other clients (Bluesky) simply show the preview.
 */
export const PROTOCOL_POST_GRAPHEME_LIMIT = 300
export const LONG_TEXT_FIELD = 'place.aqua.longText'

const ELLIPSIS = '…'

type LongText = {text: string; facets?: AppBskyRichtextFacet.Main[]}

/** Splits an over-limit post into a protocol-sized preview plus the full body. */
export function splitLongPost(rt: RichText): {
  text: string
  facets: AppBskyRichtextFacet.Main[] | undefined
  longText?: LongText
} {
  if (rt.graphemeLength <= PROTOCOL_POST_GRAPHEME_LIMIT) {
    return {text: rt.text, facets: rt.facets}
  }

  const graphemes = new Graphemer().splitGraphemes(rt.text)
  let preview = graphemes.slice(0, PROTOCOL_POST_GRAPHEME_LIMIT - 1).join('')
  // Prefer cutting at a word boundary if one is reasonably close.
  const lastSpace = preview.search(/\s\S*$/)
  if (lastSpace > preview.length * 0.8) {
    preview = preview.slice(0, lastSpace)
  }
  preview = preview.trimEnd()

  // Facets are byte ranges of a shared prefix, so keep the ones that fit.
  const previewBytes = new UnicodeString(preview).length
  const facets = rt.facets?.filter(f => f.index.byteEnd <= previewBytes)

  return {
    text: preview + ELLIPSIS,
    facets: facets?.length ? facets : undefined,
    longText: {text: rt.text, facets: rt.facets},
  }
}

function readLongText(record: object): LongText | undefined {
  const value = (record as Record<string, unknown>)[LONG_TEXT_FIELD]
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as LongText).text === 'string'
  ) {
    return value as LongText
  }
  return undefined
}

/** The text AQUA should display for a post record: full body when present. */
export function getPostTextAndFacets(record: {
  text: string
  facets?: AppBskyRichtextFacet.Main[]
}): {text: string; facets?: AppBskyRichtextFacet.Main[]} {
  const long = readLongText(record)
  // Only trust the long body if the public preview is really a prefix of it.
  if (long && long.text.startsWith(record.text.replace(/…$/, ''))) {
    return {text: long.text, facets: long.facets}
  }
  return {text: record.text, facets: record.facets}
}
