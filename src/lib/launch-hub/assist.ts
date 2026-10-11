/**
 * Launch Hub "modo assistido": turns a launch into what each assisted network
 * needs (adapted text, share URL, text to copy). Nothing is posted here: the
 * person opens the network's own composer and publishes it themselves.
 */
import {
  type AssistOptions,
  type AssistPost,
  type DestinationDef,
  effectiveMode,
  getDestination,
} from '#/lib/launch-hub/destinations'
import {
  type AdaptedPost,
  adaptPost,
  normalizeHashtag,
} from '#/lib/launch-hub/formatting'
import {
  type DestinationStatus,
  type Launch,
  type LaunchDestination,
} from '#/lib/launch-hub/types'
import {AQUA_WEB_URL} from '#/env'

/** Public URL of the launch's post on the Aqua, once it went out. */
export function aquaPostUrl(
  launch: Launch,
  base = AQUA_WEB_URL,
): string | undefined {
  const aqua = launch.destinations.find(
    d =>
      (d.provider === 'aqua' || d.provider === 'bluesky') &&
      d.status === 'published',
  )
  if (!aqua?.remoteUrl) return undefined
  return aqua.remoteUrl.startsWith('http')
    ? aqua.remoteUrl
    : `${base}${aqua.remoteUrl}`
}

export type PreparedAssist = {
  def: DestinationDef
  adapted: AdaptedPost
  post: AssistPost
  /** URL to open (undefined: missing info, e.g. Mastodon server or Telegram link). */
  openUrl?: string
  /** What "Copiar texto" puts on the clipboard. */
  copyText: string
  /** Why `openUrl` is missing, for the card. */
  missing?: string
}

export function prepareAssist(
  launch: Pick<Launch, 'contentPackage'> &
    Partial<Pick<Launch, 'destinations'>>,
  destination: Pick<
    LaunchDestination,
    'provider' | 'customCaption' | 'customTitle'
  >,
  options: AssistOptions & {aquaUrl?: string; mediaUrl?: string} = {},
): PreparedAssist {
  const def = getDestination(destination.provider)
  const content = launch.contentPackage
  const title =
    destination.customTitle?.trim() || content.title?.trim() || undefined
  const base =
    destination.customCaption?.trim() ||
    content.text.trim() ||
    [title, content.description?.trim()].filter(Boolean).join('\n\n')
  const adapted = adaptPost(
    {
      text: base,
      title,
      link: content.link,
      aquaUrl: options.aquaUrl,
      tags: content.tags,
    },
    def.capabilities.text,
  )
  const post: AssistPost = {
    text: adapted.text,
    url: adapted.url,
    title: def.id === 'reddit' ? adapted.text : title,
    mediaUrl: options.mediaUrl,
    hashtags: (content.tags ?? []).map(normalizeHashtag).filter(Boolean),
  }
  const spec = def.assist
  const openUrl = spec?.buildUrl(post, options)
  const prefillsText =
    spec?.kind === 'intent' && spec.prefills.includes('texto')
  const prefillsLink = spec?.prefills.includes('link')
  // copy everything the URL can't carry
  let copyText = adapted.text
  if (adapted.url && !prefillsLink && !def.capabilities.text.noLinksInText)
    copyText = `${copyText}\n\n${adapted.url}`
  if (prefillsText) copyText = adapted.text
  let missing: string | undefined
  if (!openUrl) {
    missing = spec?.needsInstance
      ? 'Informe o seu servidor (ex.: mastodon.social).'
      : 'Precisa de um link para compartilhar (adicione um link ou publique na Aqua primeiro).'
  } else if (def.id === 'pinterest' && !options.mediaUrl) {
    missing = 'O Pinterest precisa de uma imagem pública.'
  }
  return {def, adapted, post, openUrl, copyText, ...(missing ? {missing} : {})}
}

/** Mode the destination is fixed with when the launch starts. */
export function modeFor(
  destination: Pick<LaunchDestination, 'provider'>,
  integrationConfigured: boolean,
) {
  return effectiveMode(
    getDestination(destination.provider),
    integrationConfigured,
  )
}

export const isAssisted = (d: Pick<LaunchDestination, 'mode'>) =>
  d.mode === 'assistido'

/** Next state of an assisted destination after a person's action. */
export function assistTransition(
  current: DestinationStatus,
  action: 'abrir' | 'publicado' | 'erro' | 'pular' | 'reabrir',
): DestinationStatus {
  switch (action) {
    case 'abrir':
      return current === 'published' ? 'published' : 'opened'
    case 'publicado':
      return 'published'
    case 'erro':
      return 'failed'
    case 'pular':
      return 'skipped'
    case 'reabrir':
      return 'pending'
  }
}
