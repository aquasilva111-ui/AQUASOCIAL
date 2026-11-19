/**
 * Canonical URLs and the in-app About / Contact copy.
 *
 * robots.txt, the sitemap index, llms.txt, and page metadata are owned by
 * `web/robots.txt`, `web/sitemap.xml`, and `web/site-info.js`. The post and
 * profile sitemaps are filled by `scripts/emit-aqua-sitemap.js`.
 */

export const SITE_ORIGIN = 'https://aquaapp.systems'

export const SITE_NAME = 'Aqua'

/** Public contact address, set by the owner. */
export const ORGANIZATION_EMAIL = 'team@aquaapp.online'

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
 * Kept aligned with `canonicalForPathname`
 * (see __tests__/lib/public-site.test.ts).
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
