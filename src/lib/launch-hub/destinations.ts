/**
 * Launch Hub destinations registry: the ONE place that describes each network.
 *
 * - `mode` is the default way the network goes out today:
 *   - `auto`: an adapter publishes it (Aqua/Bluesky via the AT Protocol session);
 *   - `assistido`: the Aqua prepares the post and opens the network's own,
 *     official share/compose page already filled in; the person taps
 *     "publicar" there. Free, within each network's rules: no logged-in
 *     session automation, no scraping, nothing posted behind the person's back.
 * - `effectiveMode()` decides per launch: a network whose adapter is
 *   `integration-api` becomes `auto` as soon as the AQUA Integration API is
 *   configured (backend.ts), with no change to screens.
 * - `assist.verified` records how each URL format was checked (11/10/2026):
 *   `oficial` (network's own docs), `pratica` (works and is widely used, but
 *   the network doesn't document it), `nao-verificado` (best known URL).
 */
import {type TextRules} from '#/lib/launch-hub/formatting'
import {
  type Provider,
  type ProviderCategory,
  type ProviderId,
  type PublishMode,
} from '#/lib/launch-hub/types'

export type Verification = 'oficial' | 'pratica' | 'nao-verificado'

export type AssistPost = {
  text: string
  url?: string
  title?: string
  /** Public image URL (Pinterest needs one). */
  mediaUrl?: string
  hashtags: string[]
}

export type AssistOptions = {
  /** Mastodon: the person's server, e.g. "mastodon.social". */
  instance?: string
}

export type AssistSpec = {
  /**
   * `intent`: the URL opens the network's composer with the text/link.
   * `abrir-e-colar`: the network has no prefill; the text is copied and its
   * create page opens (the person pastes).
   */
  kind: 'intent' | 'abrir-e-colar'
  /** Returns the URL to open, or undefined when it can't be built (e.g. no instance). */
  buildUrl: (post: AssistPost, options?: AssistOptions) => string | undefined
  verified: Verification
  docs?: string
  /** Fields the share URL actually prefills (for the UI hint). */
  prefills: Array<'texto' | 'link' | 'titulo' | 'imagem' | 'hashtags'>
  /** Media must go through the device share sheet / manual upload. */
  mediaByShareSheet?: boolean
  /** Needs a server/instance chosen by the person. */
  needsInstance?: boolean
  note?: string
}

export type DestinationCapabilities = {
  text: TextRules
  link: boolean
  /** max images per post (0 = none) */
  images: number
  video: boolean
  /** a post must carry an image or video */
  mediaRequired?: boolean
}

export type DestinationDef = Provider & {
  mode: PublishMode
  capabilities: DestinationCapabilities
  assist?: AssistSpec
}

// ---------- helpers

/** Query string with encodeURIComponent (spaces as %20, # as %23). Skips empty values. */
export function qs(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

/** "https://Mastodon.Social/@x" or "@x@mastodon.social" → "mastodon.social". */
export function normalizeInstance(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  let host = raw.trim().toLowerCase()
  const at = host.includes('://') ? null : /^@?[^@\s/]+@([^@\s/]+)$/.exec(host)
  if (at) host = at[1]!
  host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/.test(host) ? host : undefined
}

const withUrl = (text: string, url?: string) =>
  url && !text.includes(url) ? `${text}${text ? '\n\n' : ''}${url}` : text

const codepoints = (
  maxLength: number,
  extra: Partial<TextRules> = {},
): TextRules => ({
  maxLength,
  counting: 'codepoints',
  linkParam: false,
  linkCountsInLimit: false,
  hashtags: true,
  ...extra,
})

// ---------- registry

export const DESTINATIONS: DestinationDef[] = [
  // OWNED
  {
    id: 'aqua',
    name: 'AQUA',
    category: 'owned',
    adapter: 'atproto-session',
    mode: 'auto',
    monogram: 'AQ',
    color: '#002bef',
    capabilities: {
      text: {
        maxLength: 300,
        counting: 'codepoints',
        linkParam: false,
        linkCountsInLimit: false,
        hashtags: true,
      },
      link: true,
      images: 4,
      video: false,
    },
  },
  {
    id: 'website',
    name: 'Website',
    category: 'owned',
    adapter: 'integration-api',
    mode: 'auto',
    monogram: 'WWW',
    color: '#4b5563',
    capabilities: {
      text: codepoints(100_000),
      link: true,
      images: 20,
      video: true,
    },
  },
  // SOCIAL
  {
    id: 'x',
    name: 'X',
    category: 'social',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'X',
    color: '#000000',
    capabilities: {
      text: {
        maxLength: 280,
        counting: 'x',
        linkParam: true,
        linkCountsInLimit: true,
        hashtags: true,
        maxHashtags: 3,
      },
      link: true,
      images: 4,
      video: true,
    },
    assist: {
      kind: 'intent',
      // x.com/intent/tweet redirects here; both work
      buildUrl: p =>
        `https://x.com/intent/post${qs({text: p.text, url: p.url})}`,
      verified: 'oficial',
      docs: 'https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent',
      prefills: ['texto', 'link'],
      mediaByShareSheet: true,
      note: 'Imagens e vídeos não vão pela URL: anexe no X (ou use Compartilhar no celular).',
    },
  },
  {
    id: 'threads',
    name: 'Threads',
    category: 'social',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'TH',
    color: '#222222',
    capabilities: {
      text: {
        maxLength: 500,
        counting: 'codepoints',
        linkParam: true,
        linkCountsInLimit: true,
        hashtags: false, // Threads usa um "tópico", não várias hashtags
      },
      link: true,
      images: 20,
      video: true,
    },
    assist: {
      kind: 'intent',
      buildUrl: p =>
        `https://www.threads.com/intent/post${qs({
          text: p.text,
          url: p.url,
          // um tópico: sem quebras, pontos ou &, até 50 caracteres
          tag: p.hashtags[0]?.replace(/[.&\s]/g, '').slice(0, 50),
        })}`,
      verified: 'oficial',
      docs: 'https://developers.facebook.com/docs/threads/threads-web-intents/',
      prefills: ['texto', 'link', 'hashtags'],
      mediaByShareSheet: true,
    },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'in',
    color: '#0a66c2',
    capabilities: {
      // o link vai no parâmetro `url` (prévia do LinkedIn), não no texto
      text: codepoints(3000, {maxHashtags: 5, linkParam: true}),
      link: true,
      images: 9,
      video: true,
    },
    assist: {
      kind: 'intent',
      // Só `url` é aceito (title/summary/source foram removidos pelo LinkedIn).
      // O texto vai pela área de transferência.
      buildUrl: p =>
        p.url
          ? `https://www.linkedin.com/sharing/share-offsite/${qs({url: p.url})}`
          : 'https://www.linkedin.com/feed/',
      verified: 'oficial',
      docs: 'https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/plugins/share-plugin',
      prefills: ['link'],
      mediaByShareSheet: true,
      note: 'O LinkedIn só recebe o link pela URL: o texto é copiado para você colar.',
    },
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'FB',
    color: '#1877f2',
    capabilities: {
      text: codepoints(63_206, {maxHashtags: 5, linkParam: true}),
      link: true,
      images: 10,
      video: true,
    },
    assist: {
      kind: 'intent',
      // O "Share Dialog" oficial exige app_id; o sharer.php funciona sem, só com o link.
      buildUrl: p =>
        p.url
          ? `https://www.facebook.com/sharer/sharer.php${qs({u: p.url})}`
          : 'https://www.facebook.com/',
      verified: 'pratica',
      docs: 'https://developers.facebook.com/docs/sharing/reference/share-dialog/',
      prefills: ['link'],
      mediaByShareSheet: true,
      note: 'O Facebook só recebe o link: o texto é copiado para você colar.',
    },
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    category: 'social',
    adapter: 'same-network',
    sameNetworkAs: 'aqua',
    mode: 'auto',
    monogram: 'BS',
    color: '#1185fe',
    capabilities: {
      text: codepoints(300),
      link: true,
      images: 4,
      video: false,
    },
  },
  {
    id: 'mastodon',
    name: 'Mastodon',
    category: 'social',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'M',
    color: '#6364ff',
    capabilities: {
      // 500 é o padrão do Mastodon; servidores podem aceitar mais
      text: codepoints(500, {maxHashtags: 5}),
      link: true,
      images: 4,
      video: true,
    },
    assist: {
      kind: 'intent',
      buildUrl: (p, o) => {
        const host = normalizeInstance(o?.instance)
        return host ? `https://${host}/share${qs({text: p.text})}` : undefined
      },
      verified: 'pratica',
      docs: 'https://github.com/mastodon/mastodon/issues/442',
      prefills: ['texto', 'link', 'hashtags'],
      mediaByShareSheet: true,
      needsInstance: true,
    },
  },
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    adapter: 'none',
    mode: 'assistido',
    monogram: 'R',
    color: '#ff4500',
    capabilities: {
      // limite do título
      text: codepoints(300, {hashtags: false, noLinksInText: true}),
      link: true,
      images: 1,
      video: false,
    },
    assist: {
      kind: 'intent',
      buildUrl: p =>
        `https://www.reddit.com/submit${qs({
          url: p.url,
          title: p.title ?? p.text,
          ...(p.url ? {type: 'LINK'} : {}),
        })}`,
      verified: 'pratica',
      prefills: ['titulo', 'link'],
      note: 'Escolha a comunidade (subreddit) e confira as regras dela antes de enviar.',
    },
  },
  {
    id: 'tumblr',
    name: 'Tumblr',
    category: 'social',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 't',
    color: '#36465d',
    capabilities: {
      text: codepoints(4096, {hashtags: false, linkParam: true}),
      link: true,
      images: 10,
      video: true,
    },
    assist: {
      kind: 'intent',
      buildUrl: p =>
        p.url
          ? `https://www.tumblr.com/widgets/share/tool${qs({
              posttype: 'link',
              canonicalUrl: p.url,
              content: p.url,
              title: p.title,
              caption: p.text,
              tags: p.hashtags.join(','),
            })}`
          : `https://www.tumblr.com/widgets/share/tool${qs({
              posttype: 'text',
              title: p.title,
              content: p.text,
              tags: p.hashtags.join(','),
            })}`,
      verified: 'oficial',
      docs: 'https://www.tumblr.com/docs/en/share_button',
      prefills: ['texto', 'link', 'titulo', 'hashtags'],
      mediaByShareSheet: true,
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'IG',
    color: '#d62976',
    capabilities: {
      text: codepoints(2200, {maxHashtags: 30, noLinksInText: true}),
      link: false,
      images: 10,
      video: true,
      mediaRequired: true,
    },
    assist: {
      kind: 'abrir-e-colar',
      // não existe URL de "postar" preenchida: legenda copiada + mídia pelo compartilhar do celular
      buildUrl: () => 'https://www.instagram.com/',
      verified: 'nao-verificado',
      prefills: [],
      mediaByShareSheet: true,
      note: 'No celular, use "Compartilhar mídia" e escolha o Instagram; a legenda já fica copiada. Links em legenda não são clicáveis.',
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'TT',
    color: '#111111',
    capabilities: {
      text: codepoints(2200, {noLinksInText: true}),
      link: false,
      images: 35,
      video: true,
      mediaRequired: true,
    },
    assist: {
      kind: 'abrir-e-colar',
      buildUrl: () => 'https://www.tiktok.com/upload',
      verified: 'nao-verificado',
      prefills: [],
      mediaByShareSheet: true,
    },
  },
  // VIDEO
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'video',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'YT',
    color: '#ff0000',
    capabilities: {
      text: codepoints(5000, {maxHashtags: 15}),
      link: true,
      images: 0,
      video: true,
      mediaRequired: true,
    },
    assist: {
      kind: 'abrir-e-colar',
      buildUrl: () => 'https://www.youtube.com/upload',
      verified: 'nao-verificado',
      prefills: [],
      mediaByShareSheet: true,
    },
  },
  // VISUAL
  {
    id: 'pinterest',
    name: 'Pinterest',
    category: 'visual',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'P',
    color: '#e60023',
    capabilities: {
      text: codepoints(500, {hashtags: false, noLinksInText: true}),
      link: true,
      images: 1,
      video: false,
      mediaRequired: true,
    },
    assist: {
      kind: 'intent',
      buildUrl: p =>
        `https://www.pinterest.com/pin/create/button/${qs({
          url: p.url,
          media: p.mediaUrl,
          description: p.text,
        })}`,
      verified: 'oficial',
      docs: 'https://developers.pinterest.com/docs/web-features/buttons/',
      prefills: ['link', 'imagem', 'texto'],
      note: 'O Pinterest precisa de uma imagem pública (a do post na Aqua serve depois que ele sair).',
    },
  },
  // WRITING
  {
    id: 'wattpad',
    name: 'Wattpad',
    category: 'writing',
    adapter: 'none',
    mode: 'assistido',
    monogram: 'W',
    color: '#ff500a',
    capabilities: {
      text: codepoints(2_000_000, {hashtags: false}),
      link: true,
      images: 1,
      video: false,
    },
    assist: {
      kind: 'abrir-e-colar',
      // a API pública foi encerrada; as regras proíbem automação
      buildUrl: () => 'https://www.wattpad.com/myworks/new',
      verified: 'pratica',
      docs: 'https://support.wattpad.com/hc/en-us/articles/201375804-Writing-a-story',
      prefills: [],
      note: 'O texto (capítulo) é copiado e o editor do Wattpad abre para você colar.',
    },
  },
  // MUSIC
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    category: 'music',
    adapter: 'integration-api',
    mode: 'assistido',
    monogram: 'SC',
    color: '#ff5500',
    capabilities: {
      text: codepoints(4000, {hashtags: false}),
      link: true,
      images: 1,
      video: false,
      mediaRequired: true,
    },
    assist: {
      kind: 'abrir-e-colar',
      buildUrl: () => 'https://soundcloud.com/upload',
      verified: 'nao-verificado',
      prefills: [],
      mediaByShareSheet: true,
    },
  },
  {
    id: 'bandlab',
    name: 'BandLab',
    category: 'music',
    adapter: 'none',
    mode: 'assistido',
    monogram: 'BL',
    color: '#f12c18',
    capabilities: {
      text: codepoints(1000, {hashtags: true}),
      link: true,
      images: 1,
      video: true,
      mediaRequired: true,
    },
    assist: {
      kind: 'abrir-e-colar',
      // sem API pública e sem URL de "novo post" documentada
      buildUrl: () => 'https://www.bandlab.com/',
      verified: 'nao-verificado',
      prefills: [],
      mediaByShareSheet: true,
      note: 'O BandLab não tem link de postar: o texto é copiado e o site abre para você enviar o arquivo.',
    },
  },
  // MESSAGING
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'messaging',
    adapter: 'none',
    mode: 'assistido',
    monogram: 'WA',
    color: '#25d366',
    capabilities: {
      text: codepoints(65_536, {hashtags: false}),
      link: true,
      images: 1,
      video: true,
    },
    assist: {
      kind: 'intent',
      buildUrl: p => `https://wa.me/${qs({text: withUrl(p.text, p.url)})}`,
      verified: 'oficial',
      docs: 'https://faq.whatsapp.com/5913398998672934',
      prefills: ['texto', 'link'],
      mediaByShareSheet: true,
      note: 'Abre o WhatsApp para você escolher a conversa, grupo ou status.',
    },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'messaging',
    adapter: 'none',
    mode: 'assistido',
    monogram: 'TG',
    color: '#229ed9',
    capabilities: {
      text: codepoints(4096, {hashtags: false, linkParam: true}),
      link: true,
      images: 1,
      video: true,
    },
    assist: {
      kind: 'intent',
      // `url` é obrigatório no link de compartilhar do Telegram
      buildUrl: p =>
        p.url
          ? `https://t.me/share/url${qs({url: p.url, text: p.text})}`
          : undefined,
      verified: 'oficial',
      docs: 'https://core.telegram.org/widgets/share',
      prefills: ['texto', 'link'],
      mediaByShareSheet: true,
    },
  },
]

const byId = new Map(DESTINATIONS.map(d => [d.id, d]))

export function getDestination(id: ProviderId): DestinationDef {
  const d = byId.get(id)
  if (!d) throw new Error(`Unknown Launch Hub destination: ${id}`)
  return d
}

/**
 * How this network goes out right now. `integrationConfigured` = the AQUA
 * Integration API is plugged in (backend.ts); when it is, every
 * `integration-api` network flips to `auto` without any screen change.
 */
export function effectiveMode(
  def: DestinationDef,
  integrationConfigured: boolean,
): PublishMode | 'indisponivel' {
  if (def.adapter === 'atproto-session' || def.adapter === 'same-network')
    return 'auto'
  if (def.adapter === 'integration-api' && integrationConfigured) return 'auto'
  return def.assist ? 'assistido' : 'indisponivel'
}

export const CATEGORY_ORDER: ProviderCategory[] = [
  'social',
  'video',
  'visual',
  'writing',
  'music',
  'messaging',
  'owned',
]

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  social: 'Social',
  video: 'Vídeo',
  visual: 'Visual',
  writing: 'Escrita',
  music: 'Música',
  messaging: 'Mensagens',
  owned: 'Canais próprios',
}

export const VERIFICATION_LABELS: Record<Verification, string> = {
  oficial: 'formato oficial',
  pratica: 'formato usado na prática (sem documentação oficial)',
  'nao-verificado': 'link não verificado',
}
