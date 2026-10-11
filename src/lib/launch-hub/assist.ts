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

/** Card subtitle: how this network receives the post (mockup: "texto e link"). */
export function assistSubtitle(def: DestinationDef): string {
  const spec = def.assist
  if (!spec) return 'automático'
  if (def.id === 'instagram') return 'pelo compartilhar do celular'
  if (def.id === 'pinterest') return 'link de criar pin'
  if (spec.kind === 'abrir-e-colar') return 'copiar e abrir'
  const p = spec.prefills
  if (p.includes('texto')) return p.includes('link') ? 'texto e link' : 'texto'
  if (p.includes('titulo')) return 'título e link'
  return 'link de compartilhar'
}

/**
 * Notice for the composer card (mockup): share links carry text and link
 * only; images go through the phone's share sheet. Undefined when none of
 * the chosen networks is affected.
 */
export function mediaNotice(defs: DestinationDef[]): string | undefined {
  const textOnly = defs
    .filter(d => d.assist?.kind === 'intent' && d.assist.mediaByShareSheet)
    .map(d => d.name)
  const viaShare = defs.some(d => d.id === 'instagram')
  if (!textOnly.length && !viaShare) return undefined
  const names =
    textOnly.length > 1
      ? `${textOnly.slice(0, -1).join(', ')} e no ${textOnly[textOnly.length - 1]}`
      : textOnly[0]
  const parts: string[] = []
  if (names)
    parts.push(
      `No ${names} o link de postar leva só texto e link. A imagem vai pelo botão de compartilhar do celular.`,
    )
  if (viaShare)
    parts.push(
      'O Instagram vai pelo compartilhar do celular, com a legenda copiada.',
    )
  return parts.join(' ')
}

const DONE_STATUSES: DestinationStatus[] = ['published', 'skipped']
export const isDone = (d: Pick<LaunchDestination, 'status'>) =>
  DONE_STATUSES.includes(d.status)

/**
 * Dock progress: done destinations over all, and the next assisted network to
 * open (first pending or failed one; an already-open one only if nothing else).
 */
export function assistProgress(destinations: LaunchDestination[]) {
  const assisted = destinations.filter(isAssisted)
  const next =
    assisted.find(d => d.status === 'pending' || d.status === 'failed') ??
    assisted.find(d => d.status === 'opened')
  return {
    done: destinations.filter(isDone).length,
    total: destinations.length,
    assistedDone: assisted.filter(isDone).length,
    assistedTotal: assisted.length,
    next,
  }
}
