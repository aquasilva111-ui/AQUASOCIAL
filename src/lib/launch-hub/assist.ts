/**
 * Launch Hub "modo assistido": turns a launch into what each assisted network
 * needs (adapted text, share URL, text to copy). Nothing is posted here: the
 * person opens the network's own composer and publishes it themselves.
 */
import {
  type AssistOptions,
  type AssistPost,
  type DestinationDef,
  getDestination,
} from '#/lib/launch-hub/destinations'
import {
  type AdaptedPost,
  adaptPost,
  normalizeHashtag,
} from '#/lib/launch-hub/formatting'
import {deriveLaunchStatus} from '#/lib/launch-hub/status'
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

export const isAssisted = (d: Pick<LaunchDestination, 'mode'>) =>
  d.mode === 'assistido'

export type AssistAction = 'abrir' | 'publicado' | 'erro' | 'pular' | 'reabrir'

type WebPopup = {opener: unknown; closed?: boolean} | null
type WebOpener = (
  url?: string | URL,
  target?: string,
  features?: string,
) => WebPopup

/**
 * Opens `url` in a new tab. Returns false when the browser blocked it.
 *
 * `window.open` with the `noopener` feature returns null even when the tab
 * did open (HTML spec), which is what react-native-web's Linking.openURL
 * uses — so that promise never rejects on a blocked pop-up. This calls
 * `window.open` without that feature and severs `opener` afterwards.
 */
export function openInNewTab(url: string, open?: WebOpener): boolean {
  const opener = open ?? defaultWebOpener()
  if (!opener) return false
  let popup: WebPopup
  try {
    popup = opener(url, '_blank')
  } catch {
    return false
  }
  if (!popup) return false
  try {
    // `closed` is already true when a blocker hands back a dead window.
    if (popup.closed) return false
    popup.opener = null
  } catch {
    // already detached, or `closed` isn't readable; the tab still opened
  }
  return true
}

function defaultWebOpener(): WebOpener | undefined {
  const w = (globalThis as {window?: {open?: WebOpener}}).window
  return w?.open?.bind(w)
}

/**
 * Applies one assisted action to a launch: destination status, timestamps
 * and the derived launch status. Pure; the store persists the result.
 */
export function applyAssistMark(
  launch: Launch,
  destinationId: string,
  action: AssistAction,
  extra: {error?: string; remoteUrl?: string} = {},
  now = new Date().toISOString(),
): Launch {
  const destinations = launch.destinations.map(d => {
    if (d.id !== destinationId) return d
    const status = assistTransition(d.status, action)
    return {
      ...d,
      status,
      error:
        status === 'failed' ? extra.error || 'Não foi publicado.' : undefined,
      ...(action === 'abrir' ? {openedAt: now} : {}),
      ...(status === 'published' ? {publishedAt: d.publishedAt ?? now} : {}),
      ...(extra.remoteUrl ? {remoteUrl: extra.remoteUrl} : {}),
      updatedAt: now,
    }
  })
  return {
    ...launch,
    destinations,
    status: deriveLaunchStatus(destinations, launch.status),
    updatedAt: now,
  }
}

/** Next state of an assisted destination after a person's action. */
export function assistTransition(
  current: DestinationStatus,
  action: AssistAction,
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
