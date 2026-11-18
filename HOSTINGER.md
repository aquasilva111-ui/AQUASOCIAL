# Hostinger web deployment

Use these settings for the React website:

- Framework: React
- Root directory: `./`
- Package manager: npm
- Build command: `npm run build`
- Output directory: `web-build`
- Node: 22.x

`npm run build` compiles the checked-in Lingui translation catalogs, exports the
website with Webpack, and runs the existing web post-build script. Do not run
Expo native prebuild on the web host: it generates Android/iOS projects and
requires native-only configuration such as `google-services.json`.

For native development, use `yarn native:prebuild`. The previous EAS build
workflow is available as `yarn build:native`.

After deployment, verify both the home page and a directly opened client route
such as `/search`; the host must serve the corresponding generated HTML for known client routes.
The post-build script generates `web-build/.htaccess` for static Hostinger
deploys while preserving static asset requests. It also copies `web/robots.txt`,
`web/sitemap.xml`, and `web/sitemaps/*.xml`. Those files are real files in the
export, so Apache serves them. A missing `.txt` or `.xml` is not rewritten to
`index.html`.

## Production, staging, and previews

The public site and the test site are two Hostinger deployments of this same
build. The step-by-step for Samu, in Portuguese, is `docs/ambientes.md`.

| Site | Host | Git branch | `AQUA_DEPLOY_ENV` |
| --- | --- | --- | --- |
| Official | `aquaapp.systems` and `www` | `producao` | unset, or `production` |
| Test | `teste.aquaapp.systems` | `1.111.0-ota-5` | `staging` |

Leave the variable unset on the official site. An absent value keeps the
current production `robots.txt`, sitemap, and HTML. Do not create the
`producao` branch from a deploy script; it is promoted only when Samu merges
a pull request into it.

`web-build/.htaccess` and `server.js` treat every host other than
`aquaapp.systems` and `www.aquaapp.systems` as non-production: they send
`X-Robots-Tag: noindex, nofollow` and serve `Disallow: /` for `/robots.txt`.
On the public host those rules do not run, so the committed robots file and
the sitemap stay as they are. Staging and preview builds also write
`<meta name="robots" content="noindex, nofollow">` into the HTML.
`server.js` adds that tag on any non-production host, including when the
build itself was production.

Cloudflare Pages is only for pull-request previews. Its build command and
output directory match the table above (`npm run build`, `web-build`). See
`wrangler.toml` and `docs/ambientes.md`.

## Agent discovery and MCP

The web build copies the static `robots.txt` and sitemap index, and generates
llms.txt, the Markdown homepage, and page metadata from `web/site-info.js`.
Apache-compatible static serving uses the generated `web-build/.htaccess` rules
for public pages, Markdown, and HTTP 404s. The route allowlist comes from
`src/routes.ts`. Unrecognized app paths return HTTP 404. A recognized dynamic
path may still display an in-app error if the upstream record does not exist.

To expose the public MCP endpoint and its discovery card, run the existing Node
HTTP server behind the domain instead of the static React preset. Use the
`Other` framework preset on Hostinger with Node 22.x, project root `./`,
npm, build command `npm run build`, and entry file `server.js` (or start command
`npm start` where applicable). Route requests through the Node entry point so
homepage negotiation and the MCP paths reach it. Validate this configuration on
a preview before switching production.

The MCP card is served at `/.well-known/mcp/server-card.json`. It points to the
stateless Streamable HTTP endpoint at `/mcp`, which exposes one read-only tool
returning the public site guide. WebMCP exposes the same guide in browsers with
the API enabled. Run `node --test scripts/test-site-discovery.js` to validate
the generated files and exercise both MCP interfaces with Node 22.
