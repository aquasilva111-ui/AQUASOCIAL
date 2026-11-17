/**
 * Public-web facts for https://aquaapp.systems.
 *
 * `CONTENT_SIGNAL` is the only site-wide Content-Signal value. Change it here
 * and run `node scripts/emit-public-web.js` (the web build does this too).
 * Robots, sitemap, llms.txt, and the tags in web/index.html are generated
 * from this file.
 */

export const SITE_ORIGIN = 'https://aquaapp.systems'

export const SITE_NAME = 'Aqua'

export const PARENT_ORGANIZATION_NAME = 'Evergreen'

/**
 * Policy for URLs robots.txt allows. Owner decision: search, AI input, and
 * AI training are enabled. Disallowed prefixes are out of both search and
 * training because crawlers must not fetch them.
 */
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes'

export const SITE_DESCRIPTION =
  'Aqua é uma rede social multi-núcleos, fork do Bluesky no AT Protocol, com Pra você, Visionboard, Views, Artigos, Livros e Launch Hub.'

/**
 * schema.org sameAs. Empty until the owner confirms official profile URLs.
 * TODO(owner): add only profiles that already exist. Do not invent accounts.
 */
export const ORGANIZATION_SAME_AS: readonly string[] = []

/** Public contact address, set by the owner. */
export const ORGANIZATION_EMAIL = 'team@aquaapp.online'

export const LOGO_PATH = '/logo.png'

/** Search screen reads `q` on /search. */
export const SEARCH_URL_TEMPLATE = `${SITE_ORIGIN}/search?q={search_term_string}`

/**
 * Suffixes already treated as Bluesky-hosted by postOriginFromHandle.
 * Custom-domain Bluesky accounts share the Aqua post URL shape, so robots.txt
 * cannot tell them apart.
 */
export const BLUESKY_HANDLE_SUFFIXES = [
  '.bsky.social',
  '.bsky.app',
  '.bsky.team',
] as const

export const SR_ONLY_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;border:0;'

export function isBlueskyHostedHandle(handle: string): boolean {
  const normalized = handle.toLowerCase()
  return BLUESKY_HANDLE_SUFFIXES.some(suffix => normalized.endsWith(suffix))
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Path only, no query, no trailing slash (except the homepage). */
export function normalizePathname(pathname: string): string {
  const path = (pathname.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  return path.startsWith('/') ? path : `/${path}`
}

/**
 * Homepage and native Aqua URLs stay on aquaapp.systems.
 * A post whose handle is Bluesky-hosted points at the original bsky.app URL.
 */
export function canonicalForPathname(pathname: string): string {
  const path = normalizePathname(pathname)
  const match = /^\/profile\/([^/]+)\/post\/([^/]+)$/i.exec(path)
  if (match) {
    const handle = safeDecode(match[1])
    const rkey = safeDecode(match[2])
    if (isBlueskyHostedHandle(handle)) {
      return `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}`
    }
    return `${SITE_ORIGIN}/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}`
  }
  if (path === '/') return `${SITE_ORIGIN}/`
  return `${SITE_ORIGIN}${path}`
}

/**
 * Runs from web/index.html before the app loads, and stays aligned with
 * `canonicalForPathname` (see __tests__/lib/public-site.test.ts).
 */
export function headBootstrapScript(): string {
  const suffixes = JSON.stringify([...BLUESKY_HANDLE_SUFFIXES])
  return `(function(){
  var suffixes = ${suffixes};
  var site = ${JSON.stringify(SITE_ORIGIN)};
  var path = (location.pathname || "/").split("?")[0].replace(/\\/+$/, "") || "/";
  if (path.charAt(0) !== "/") path = "/" + path;
  var canonical = path === "/" ? site + "/" : site + path;
  var match = /^\\/profile\\/([^/]+)\\/post\\/([^/]+)$/i.exec(path);
  if (match) {
    var handle = match[1];
    var rkey = match[2];
    try { handle = decodeURIComponent(handle); } catch (e) {}
    try { rkey = decodeURIComponent(rkey); } catch (e) {}
    var hosted = false;
    var lower = handle.toLowerCase();
    for (var i = 0; i < suffixes.length; i++) {
      if (lower.slice(-suffixes[i].length) === suffixes[i]) hosted = true;
    }
    if (hosted) {
      canonical = "https://bsky.app/profile/" + encodeURIComponent(handle) + "/post/" + encodeURIComponent(rkey);
    } else {
      canonical = site + "/profile/" + encodeURIComponent(handle) + "/post/" + encodeURIComponent(rkey);
    }
  }
  var link = document.getElementById("canonical");
  if (link) link.setAttribute("href", canonical);
  var og = document.querySelector('meta[property="og:url"]');
  if (og) og.setAttribute("content", canonical);
  var heading = document.getElementById("aqua-home-heading");
  if (heading && path !== "/") heading.remove();
})();`
}

/** Keeps canonical, og:url, and the home-only h1 in sync after client navigations. */
export function syncPublicDocument(pathname: string) {
  if (typeof document === 'undefined') return
  const href = canonicalForPathname(pathname)
  const link = document.getElementById('canonical')
  if (link) link.setAttribute('href', href)
  const og = document.querySelector('meta[property="og:url"]')
  if (og) og.setAttribute('content', href)

  const path = normalizePathname(pathname)
  const existing = document.getElementById('aqua-home-heading')
  if (path !== '/') {
    existing?.remove()
    return
  }
  if (existing) return
  const heading = document.createElement('h1')
  heading.id = 'aqua-home-heading'
  heading.textContent = SITE_NAME
  heading.setAttribute('style', SR_ONLY_STYLE)
  document.body.insertBefore(heading, document.body.firstChild)
}

/**
 * TODO(owner): public Aqua posts stay out of the sitemap until this is true.
 * Never list a post that carries the Bluesky origin ("Do Bluesky").
 */
export const INCLUDE_AQUA_POSTS_IN_SITEMAP = false

/**
 * TODO(owner): public Aqua profiles stay out of the sitemap until this is true.
 */
export const INCLUDE_AQUA_PROFILES_IN_SITEMAP = false

/** Filled by a later change once INCLUDE_AQUA_POSTS_IN_SITEMAP is turned on. */
export const AQUA_POST_SITEMAP_URLS: readonly string[] = []

/** Filled by a later change once INCLUDE_AQUA_PROFILES_IN_SITEMAP is turned on. */
export const AQUA_PROFILE_SITEMAP_URLS: readonly string[] = []

export type SitemapSection = {
  id: string
  urls: readonly string[]
}

function page(path: string) {
  return path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`
}

/**
 * Add a section by appending to this list. The emitter writes
 * /sitemaps/<id>.xml and links it from /sitemap.xml.
 * Later PRs can add {id: 'books', urls} for /books/read chapters and
 * {id: 'views', urls} for Views videos.
 */
export const SITEMAP_SECTIONS: readonly SitemapSection[] = [
  {
    id: 'institutional',
    urls: [
      page('/about'),
      page('/contact'),
      page('/support'),
      page('/support/privacy'),
      page('/support/tos'),
      page('/support/community-guidelines'),
      page('/support/copyright'),
    ],
  },
  {
    id: 'sections',
    urls: [
      page('/'),
      page('/search'),
      page('/visionboard'),
      page('/views'),
      page('/books'),
      page('/reads'),
      page('/noticias'),
      page('/music'),
      page('/drops'),
      page('/feeds'),
      page('/launch'),
      page('/creative-hub'),
      page('/docs'),
      page('/wiki'),
    ],
  },
]

/** Never list these trees. /adult is the whole Aqua+18 area. */
export const SITEMAP_FORBIDDEN_PREFIXES = [
  '/adult',
  '/messages',
  '/settings',
] as const

/**
 * Disallow for User-agent: *. `/adult` is a prefix, so every Aqua+18 screen
 * is out of search and out of AI training for every crawler that honors *.
 * Do not add a more specific User-agent group that forgets these lines.
 */
export const ROBOTS_DISALLOW_PREFIXES = [
  '/adult',
  '/settings',
  '/messages',
  '/notifications',
  '/moderation',
  '/sys',
  '/saved',
] as const

/**
 * First URL segments that fall back to index.html. `videos` is a 301, not a
 * fallback. `intent`, `gate`, and `download` are handled by the web app even
 * though they are not screens in routes.ts.
 */
export const SPA_FALLBACK_PREFIXES = [
  'about',
  'adult',
  'books',
  'contact',
  'creative-hub',
  'docs',
  'download',
  'drops',
  'feeds',
  'gate',
  'hashtag',
  'images',
  'intent',
  'launch',
  'lists',
  'messages',
  'moderation',
  'music',
  'noticias',
  'notifications',
  'profile',
  'reads',
  'saved',
  'search',
  'settings',
  'start',
  'starter-pack',
  'starter-pack-short',
  'stories',
  'support',
  'sys',
  'topic',
  'ui-ai',
  'video-feed',
  'views',
  'visionboard',
  'wiki',
] as const

export function sitemapSections(): SitemapSection[] {
  const sections: SitemapSection[] = SITEMAP_SECTIONS.map(section => ({
    id: section.id,
    urls: [...section.urls],
  }))
  if (INCLUDE_AQUA_POSTS_IN_SITEMAP) {
    sections.push({id: 'posts', urls: [...AQUA_POST_SITEMAP_URLS]})
  }
  if (INCLUDE_AQUA_PROFILES_IN_SITEMAP) {
    sections.push({id: 'profiles', urls: [...AQUA_PROFILE_SITEMAP_URLS]})
  }
  for (const section of sections) {
    for (const url of section.urls) assertSitemapUrl(url)
  }
  return sections
}

export function assertSitemapUrl(url: string) {
  const parsed = new URL(url)
  if (parsed.origin !== SITE_ORIGIN) {
    throw new Error(`Sitemap URL is outside ${SITE_ORIGIN}: ${url}`)
  }
  const path = parsed.pathname
  for (const prefix of SITEMAP_FORBIDDEN_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      throw new Error(`Sitemap must not include ${prefix}: ${url}`)
    }
  }
  const post = /^\/profile\/([^/]+)\/post\/[^/]+$/i.exec(path)
  if (!post) return
  if (!INCLUDE_AQUA_POSTS_IN_SITEMAP) {
    throw new Error(
      `Aqua posts stay out until INCLUDE_AQUA_POSTS_IN_SITEMAP is true: ${url}`,
    )
  }
  if (isBlueskyHostedHandle(safeDecode(post[1]))) {
    throw new Error(`Sitemap must not include Bluesky posts: ${url}`)
  }
}

export const ABOUT_TITLE = 'Sobre a Aqua'

export const ABOUT_PARAGRAPHS = [
  'A Aqua é uma rede social multi-núcleos. É um fork do Bluesky no AT Protocol.',
  'Os núcleos públicos são Pra você, Visionboard, Views, Artigos, Livros e o Launch Hub.',
  'A organização Aqua tem como organização-mãe a Evergreen.',
] as const

export const CONTACT_TITLE = 'Contato'

export const CONTACT_PARAGRAPHS = [
  `O e-mail público da Aqua é ${ORGANIZATION_EMAIL}.`,
  'As páginas de suporte, termos e privacidade estão no próprio site.',
] as const

export const CONTACT_MAILTO = {
  href: `mailto:${ORGANIZATION_EMAIL}`,
  label: ORGANIZATION_EMAIL,
} as const

export const INFO_PAGE_LINKS = [
  {href: '/', label: 'Início'},
  {href: '/about', label: 'Sobre'},
  {href: '/contact', label: 'Contato'},
  {href: '/support/tos', label: 'Termos'},
  {href: '/support/privacy', label: 'Privacidade'},
] as const

export const LLMS_TXT = `# Aqua

> ${SITE_DESCRIPTION} Organização-mãe: ${PARENT_ORGANIZATION_NAME}.

A Aqua reúne vários núcleos no mesmo site:

- Pra você: a linha do tempo em ${SITE_ORIGIN}/
- Visionboard: imagens em ${SITE_ORIGIN}/visionboard
- Views: vídeo em ${SITE_ORIGIN}/views
- Artigos: ${SITE_ORIGIN}/reads
- Livros e Write: ${SITE_ORIGIN}/books
- Launch Hub: ${SITE_ORIGIN}/launch

## Páginas

- [Início](${SITE_ORIGIN}/): Pra você
- [Busca](${SITE_ORIGIN}/search): busca
- [Visionboard](${SITE_ORIGIN}/visionboard): imagens
- [Views](${SITE_ORIGIN}/views): vídeo
- [Livros](${SITE_ORIGIN}/books): livros e escrita
- [Artigos](${SITE_ORIGIN}/reads): leituras
- [Notícias](${SITE_ORIGIN}/noticias): notícias
- [Música](${SITE_ORIGIN}/music): música
- [Drops](${SITE_ORIGIN}/drops): drops
- [Feeds](${SITE_ORIGIN}/feeds): feeds
- [Launch Hub](${SITE_ORIGIN}/launch): lançamentos
- [Creative Hub](${SITE_ORIGIN}/creative-hub): hub criativo
- [Docs](${SITE_ORIGIN}/docs): documentos
- [Wiki](${SITE_ORIGIN}/wiki): wiki
- [Sobre](${SITE_ORIGIN}/about): o que é a Aqua
- [Contato](${SITE_ORIGIN}/contact): contato
- [Suporte](${SITE_ORIGIN}/support): suporte
- [Termos](${SITE_ORIGIN}/support/tos): termos de uso
- [Privacidade](${SITE_ORIGIN}/support/privacy): privacidade
- [Diretrizes da comunidade](${SITE_ORIGIN}/support/community-guidelines): diretrizes
- [Direitos autorais](${SITE_ORIGIN}/support/copyright): política de direitos autorais

## Fora deste arquivo

Aqua+18 (\`/adult\`), Mailssage (\`/messages\`), configurações (\`/settings\`) e posts de terceiros vindos do Bluesky não entram aqui. Um e-mail público de contato ainda não foi definido.
`

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderSimplePage(opts: {
  title: string
  paragraphs: readonly string[]
  path: string
  robots?: string
  extraLinks?: readonly {href: string; label: string}[]
}) {
  const description = opts.paragraphs[0] ?? opts.title
  const robots = opts.robots
    ? `\n  <meta name="robots" content="${escapeHtml(opts.robots)}">`
    : ''
  const links = [...(opts.extraLinks ?? []), ...INFO_PAGE_LINKS]
    .map(
      link =>
        `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`,
    )
    .join(' · ')
  const body = opts.paragraphs
    .map(paragraph => `    <p>${escapeHtml(paragraph)}</p>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(opts.title)} — ${SITE_NAME}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonicalForPathname(opts.path))}">${robots}
  <style>
    body { margin: 0; background: #fff; color: #000; font-family: Helvetica, Arial, sans-serif; }
    main { max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem; }
    h1 { font-size: 1.75rem; line-height: 1.3; font-weight: 700; }
    p { font-size: 1rem; line-height: 1.5; }
    a { color: #002bef; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(opts.title)}</h1>
${body}
    <p>${links}</p>
  </main>
</body>
</html>
`
}

export function renderRobotsTxt() {
  const disallows = ROBOTS_DISALLOW_PREFIXES.map(
    prefix => `Disallow: ${prefix}`,
  ).join('\n')
  return `# Generated from src/lib/public-site.ts. Edit CONTENT_SIGNAL there.
# One User-agent group on purpose: a more specific group that omitted the
# Disallow lines would opt that crawler back into blocked URLs.
User-agent: *
Content-Signal: ${CONTENT_SIGNAL}
Allow: /

# Private app areas, including Mailssage (/messages) and settings.
# Aqua+18 lives only under /adult (every Adult* screen in src/routes.ts).
# This Disallow applies to all user-agents: do not crawl those URLs for
# search or for AI training.
${disallows}

# Posts share one path, /profile/<handle>/post/<rkey>, for Aqua and Bluesky.
# robots.txt cannot exclude only Bluesky posts. Per-page meta is a separate
# decision and is not set here.

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderSitemapIndex(sections: readonly SitemapSection[]) {
  const body = sections
    .map(
      section =>
        `  <sitemap><loc>${escapeXml(`${SITE_ORIGIN}/sitemaps/${section.id}.xml`)}</loc></sitemap>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`
}

export function renderUrlSet(urls: readonly string[]) {
  const body = urls
    .map(url => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`
}

export function publicWebFiles(): Record<string, string> {
  const sections = sitemapSections()
  const files: Record<string, string> = {
    'robots.txt': renderRobotsTxt(),
    'sitemap.xml': renderSitemapIndex(sections),
    'llms.txt': LLMS_TXT,
    'index.md': LLMS_TXT,
    '404.html': renderSimplePage({
      title: 'Página não encontrada',
      paragraphs: ['Esse endereço não existe na Aqua.'],
      path: '/404.html',
      robots: 'noindex',
    }),
    'about.html': renderSimplePage({
      title: ABOUT_TITLE,
      paragraphs: ABOUT_PARAGRAPHS,
      path: '/about',
    }),
    'contact.html': renderSimplePage({
      title: CONTACT_TITLE,
      paragraphs: CONTACT_PARAGRAPHS,
      path: '/contact',
      extraLinks: [CONTACT_MAILTO],
    }),
  }
  for (const section of sections) {
    files[`sitemaps/${section.id}.xml`] = renderUrlSet(section.urls)
  }
  return files
}

export function publicSiteJsonLd() {
  const organization: Record<string, unknown> = {
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}${LOGO_PATH}`,
    description: SITE_DESCRIPTION,
    parentOrganization: {
      '@type': 'Organization',
      name: PARENT_ORGANIZATION_NAME,
    },
    sameAs: [...ORGANIZATION_SAME_AS],
  }
  if (ORGANIZATION_EMAIL) {
    organization.email = ORGANIZATION_EMAIL
    organization.contactPoint = {
      '@type': 'ContactPoint',
      email: ORGANIZATION_EMAIL,
      contactType: 'customer support',
    }
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: SEARCH_URL_TEMPLATE,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': ['WebApplication', 'SoftwareApplication'],
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        applicationCategory: 'SocialNetworkingApplication',
        operatingSystem: 'Web',
        description: SITE_DESCRIPTION,
      },
    ],
  }
}

export function renderPublicSiteHead() {
  const json = JSON.stringify(publicSiteJsonLd()).replace(/</g, '\\u003c')
  const description = escapeHtml(SITE_DESCRIPTION)
  return `<!-- BEGIN public-site-head -->
    <meta name="description" content="${description}">
    <link rel="canonical" id="canonical" href="${SITE_ORIGIN}/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:title" content="${SITE_NAME}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${SITE_ORIGIN}/">
    <meta property="og:image" content="${SITE_ORIGIN}${LOGO_PATH}">
    <!-- TODO(owner): Organization.sameAs is empty until official profile URLs are confirmed. -->
    <script type="application/ld+json">${json}</script>
    <!-- END public-site-head -->`
}

export function renderPublicSiteBody() {
  return `<!-- BEGIN public-site-body -->
    <h1 id="aqua-home-heading" style="${SR_ONLY_STYLE}">${SITE_NAME}</h1>
    <script>${headBootstrapScript()}</script>
    <!-- END public-site-body -->`
}

export function renderSpaFallbackBlock() {
  const alternation = SPA_FALLBACK_PREFIXES.join('|')
  return `# BEGIN spa-fallback-prefixes
RewriteCond %{REQUEST_URI} ^/(${alternation})(/|$) [NC,OR]
RewriteCond %{REQUEST_URI} ^/$
RewriteRule ^ index.html [L]
# END spa-fallback-prefixes`
}

export function patchMarkedBlock(
  source: string,
  begin: string,
  end: string,
  replacement: string,
) {
  const pattern = new RegExp(
    `${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`,
  )
  if (!pattern.test(source)) {
    throw new Error(`Missing marker block: ${begin}`)
  }
  return source.replace(pattern, replacement)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
