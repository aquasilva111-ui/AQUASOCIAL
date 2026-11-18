const path = require('path')
const fs = require('fs')

const projectRoot = path.join(__dirname, '..')
fs.copyFileSync(
  path.join(projectRoot, 'web/.htaccess'),
  path.join(projectRoot, 'web-build/.htaccess'),
)
// Consola da Unidade de Inteligência em /ui-ai (página estática; fala com a
// U.I. local do usuário). Fonte: repositório I.U-A.I, ui/web/consola.html.
fs.cpSync(
  path.join(projectRoot, 'web/ui-ai'),
  path.join(projectRoot, 'web-build/ui-ai'),
  {recursive: true},
)
const templateFile = path.join(
  projectRoot,
  'bskyweb',
  'templates',
  'scripts.html',
)

const {entrypoints} = require(
  path.join(projectRoot, 'web-build/asset-manifest.json'),
)

console.log(`Found ${entrypoints.length} entrypoints`)
console.log(`Writing ${templateFile}`)

const outputFile = entrypoints
  .map(name => {
    const file = path.basename(name)
    const ext = path.extname(file)

    if (ext === '.js') {
      return `<script defer="defer" src="{{ staticCDNHost }}/static/js/${file}"></script>`
    }
    if (ext === '.css') {
      return `<link rel="stylesheet" href="{{ staticCDNHost }}/static/css/${file}">`
    }

    return ''
  })
  .join('\n')
fs.writeFileSync(templateFile, outputFile)

const indexPath = path.join(projectRoot, 'web-build/index.html')
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8')
  if (!/<base\s+href="\/"\s*>/i.test(html)) {
    html = html.replace(/<head>/i, '<head>\n    <base href="/">')
  }
  html = html.replace(/(src|href)="(?!\/|https?:|data:)(static\/)/g, '$1="/$2')
  fs.writeFileSync(indexPath, html)
  console.log('Absolutized static URLs in web-build/index.html')
}

function copyFiles(sourceDir, targetDir) {
  const files = fs.readdirSync(path.join(projectRoot, sourceDir))
  files.forEach(file => {
    const sourcePath = path.join(projectRoot, sourceDir, file)
    const targetPath = path.join(projectRoot, targetDir, file)
    fs.copyFileSync(sourcePath, targetPath)
    console.log(`Copied ${sourcePath} to ${targetPath}`)
  })
}

copyFiles('web-build/static/js', 'bskyweb/static/js')
copyFiles('web-build/static/css', 'bskyweb/static/css')
copyFiles('web-build/static/media', 'bskyweb/static/media')

// Public AT Protocol client metadata. The committed template uses
// example.invalid. A real origin is written only into this build output.
function writeOAuthClientMetadata() {
  const {buildPublicClientMetadata} = require('./aqua-oauth-metadata')
  const fromEnv = buildPublicClientMetadata(
    process.env.EXPO_PUBLIC_AQUA_IDENTITY_ORIGIN,
  )
  const metadata =
    fromEnv ||
    JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, 'public/oauth/client-metadata.json'),
        'utf8',
      ),
    )
  const dir = path.join(projectRoot, 'web-build/oauth')
  fs.mkdirSync(dir, {recursive: true})
  fs.writeFileSync(
    path.join(dir, 'client-metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
  )
  console.log('Wrote web-build/oauth/client-metadata.json')
}

writeOAuthClientMetadata()
