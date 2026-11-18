const fs = require('node:fs')
const path = require('node:path')

const {copyPublicSiteFiles} = require('./public-site-files')
const {
  origin,
  name,
  description,
  email,
  pages,
  navigation,
  structuredData,
} = require('../web/site-info')

function escapeHtml(content) {
  return content.replace(/[&<>"']/g, character => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]
  })
}

function replaceSlot(html, slot, value) {
  const placeholder = {
    AQUA_SITE_HEAD: /<meta name=["']?aqua-site-head["']?\s*\/?>/i,
    AQUA_SITE_HEADING: /<div id=["']?aqua-site-heading["']?>\s*<\/div>/i,
    AQUA_SITE_LINKS: /<span id=["']?aqua-site-links["']?>\s*<\/span>/i,
  }[slot]
  if (!placeholder.test(html)) throw new Error(`Missing ${slot} in web index`)
  return html.replace(placeholder, () => value)
}

function links(items) {
  return items
    .map(
      ([label, url]) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`,
    )
    .join(' · ')
}

function routePatterns(projectRoot) {
  // Parse the same literal route declarations used by the client router.
  const ts = require('typescript')
  const file = path.join(projectRoot, 'src/routes.ts')
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const router = source.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => statement.declarationList.declarations)
    .find(declaration => declaration.name.getText(source) === 'router')
  const routes = router?.initializer?.arguments?.[0]
  if (!routes || !ts.isObjectLiteralExpression(routes)) {
    throw new Error('Could not read the client router declarations')
  }
  return routes.properties.flatMap(property => {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`Unsupported route: ${property.getText(source)}`)
    }
    const value = property.initializer
    const literals = ts.isArrayLiteralExpression(value)
      ? value.elements
      : [value]
    return literals.map(literal => {
      if (!ts.isStringLiteral(literal) || !literal.text.startsWith('/')) {
        throw new Error(`Unsupported route: ${property.getText(source)}`)
      }
      return literal.text
        .split('/')
        .slice(1)
        .map(segment =>
          /^:\w+$/.test(segment)
            ? '[^/]+'
            : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('/')
    })
  })
}

function pageMeta(pathname, page) {
  const json = JSON.stringify(structuredData(pathname, page)).replace(
    /</g,
    '\\u003c',
  )
  return [
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<link rel="canonical" href="${origin + pathname}">`,
    `<script type="application/ld+json">${json}</script>`,
  ].join('\n    ')
}

function infoPage(pathname, page) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} — ${name}</title>
  ${pageMeta(pathname, page)}
  <style>
    :root { color-scheme: light dark; }
    body { font: 1rem/1.6 system-ui, sans-serif; max-width: 42rem; margin: 4rem auto; padding: 0 1.25rem; }
    a { color: light-dark(#002bef, #93baff); }
    nav { margin-top: 2rem; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(page.title)}</h1>
    ${page.body.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('\n    ')}
    <p>${links(page.links)}</p>
  </main>
  <nav aria-label="AQUA Social">${links([['Início', '/'], ...navigation])}</nav>
</body>
</html>
`
}

function buildSiteDiscovery(projectRoot, html) {
  const output = path.join(projectRoot, 'web-build')
  const details = path.join(output, '_aqua-pages')
  fs.mkdirSync(details, {recursive: true})
  const routeFiles = {}
  const rewritePages = []
  for (const [pathname, page] of Object.entries(pages)) {
    const file = pathname === '/' ? 'index.html' : `_aqua-pages${pathname}.html`
    routeFiles[pathname] = file
    if (pathname !== '/') {
      rewritePages.push(`RewriteRule ^${pathname.slice(1)}/?$ ${file} [L,NC]`)
    }
    const heading = `<h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap">${escapeHtml(page.title)}</h1>`
    const nav =
      pathname === '/' ? links([...navigation, [email, `mailto:${email}`]]) : ''
    const alternate =
      pathname === '/'
        ? '<link rel="alternate" type="text/markdown" href="/index.md">\n    <script src="/webmcp.js" defer></script>'
        : ''
    const appPage = replaceSlot(
      replaceSlot(
        replaceSlot(
          html,
          'AQUA_SITE_HEAD',
          `${pageMeta(pathname, page)}\n    ${alternate}`,
        ),
        'AQUA_SITE_HEADING',
        heading,
      ),
      'AQUA_SITE_LINKS',
      nav,
    ).replace(
      /<title>[^<]*<\/title>/i,
      () =>
        `<title>${escapeHtml(pathname === '/' ? name : `${page.title} — ${name}`)}</title>`,
    )
    fs.writeFileSync(
      path.join(output, file),
      page.body ? infoPage(pathname, page) : appPage,
    )
  }

  routeFiles['*'] = '_aqua-pages/app.html'
  const app = replaceSlot(
    replaceSlot(
      replaceSlot(html, 'AQUA_SITE_HEAD', ''),
      'AQUA_SITE_HEADING',
      '',
    ),
    'AQUA_SITE_LINKS',
    '',
  )
  fs.writeFileSync(path.join(output, routeFiles['*']), app)
  const patterns = routePatterns(projectRoot)
  const routes = {pages: routeFiles, patterns}
  fs.writeFileSync(
    path.join(output, 'site-routes.json'),
    JSON.stringify(routes),
  )

  const htaccess = fs.readFileSync(
    path.join(projectRoot, 'web/.htaccess'),
    'utf8',
  )
  fs.writeFileSync(
    path.join(output, '.htaccess'),
    htaccess.replace('# AQUA_PAGE_RULES', rewritePages.join('\n')).replace(
      '# AQUA_APP_RULES',
      patterns
        .filter(Boolean)
        .map(pattern => `RewriteRule ^${pattern}$ ${routeFiles['*']} [L,NC]`)
        .join('\n'),
    ),
  )

  // Committed robots.txt and sitemap index. Page HTML, llms.txt, and
  // index.md still come from site-info; the sitemap does not.
  copyPublicSiteFiles(projectRoot, output)
  fs.copyFileSync(
    path.join(projectRoot, 'web/webmcp.js'),
    path.join(output, 'webmcp.js'),
  )
  const pageLinks = Object.entries(pages)
    .filter(([pathname]) => pathname !== '/')
    .map(
      ([pathname, page]) =>
        `- [${page.title}](${origin + pathname}): ${page.description}`,
    )
    .join('\n')
  fs.writeFileSync(
    path.join(output, 'llms.txt'),
    `# ${name}\n\n> ${description}\n\n## Páginas públicas\n\n${pageLinks}\n`,
  )
  fs.writeFileSync(
    path.join(output, 'index.md'),
    `# ${name}\n\n${description}\n\n## Explore o AQUA\n\n${pageLinks}\n`,
  )
  fs.writeFileSync(
    path.join(output, '404.html'),
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Página não encontrada — AQUA Social</title><h1>Página não encontrada</h1><p><a href="/">Voltar ao AQUA Social</a></p></html>\n',
  )
}

module.exports = {buildSiteDiscovery}
