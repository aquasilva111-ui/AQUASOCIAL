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
`index.html`. `scripts/emit-aqua-sitemap.js` then rewrites `sitemap-posts.xml`
and `sitemap-profiles.xml` from the public Aqua PDS (`https://pds.aquaapp.online`,
`com.atproto.sync.listRepos` and `app.bsky.feed.post` records). Profile URLs are
`/profile/<handle>` and post URLs are `/profile/<handle>/post/<rkey>`. Deactivated
accounts, takedowns, `!no-unauthenticated`, `!hide`, and adult labels stay out.
If the PDS does not answer, those two files are written empty and the build
continues. Only `aquaapp.systems` is indexable: any other host gets
`X-Robots-Tag: noindex` and `Disallow: /`.

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
`npm start` where applicable). LiteSpeed loads that entry with `require()`,
not as the main module; `server.js` listens in that case too, on `PORT`.
Route requests through the Node entry point so
homepage negotiation and the MCP paths reach it. Validate this configuration on
a preview before switching production.

The MCP card is served at `/.well-known/mcp/server-card.json`. It points to the
stateless Streamable HTTP endpoint at `/mcp`, which exposes one read-only tool
returning the public site guide. WebMCP exposes the same guide in browsers with
the API enabled. Run `node --test scripts/test-site-discovery.js` to validate
the generated files and exercise both MCP interfaces with Node 22.
